import "server-only"
import { createHash } from "node:crypto"
import { createRequire } from "node:module"
import { runInThisContext } from "node:vm"
import solc, { type Solc } from "solc"
import {
  BUNDLED_RELEASE,
  CompilerVersionError,
  collectVersionConstraints,
  getBundledIfSatisfied,
  parseReleaseList,
  type SolcRelease,
  selectCompilerVersion,
} from "@/lib/solidity/compiler-version"

// Loads the solc build a compilation needs. The bundled compiler covers most
// contracts and needs no network. Other releases are downloaded from
// binaries.soliditylang.org, which takes a few seconds and 8-25 MB, so every
// loaded compiler and the release list are kept in memory for the life of the
// serverless instance.
//
// solc.loadRemoteVersion is not used: it has no timeout, does not check the
// published checksum, and relies on Module#_compile, which Bun lacks. The
// download below does the same thing (evaluate soljson as a CommonJS module and
// wrap it with solc.setupMethods) with those gaps closed.

const BINARIES_URL = "https://binaries.soliditylang.org/bin"
const RELEASE_LIST_URL = `${BINARIES_URL}/list.json`
const RELEASE_LIST_TTL_MS = 60 * 60_000
// After a failed fetch, don't make every request wait for another timeout.
const RELEASE_LIST_RETRY_MS = 60_000
const RELEASE_LIST_TIMEOUT_MS = 5000
// How long a compile waits for a download. The chat route has 60s in total
// and still has to deploy afterwards.
const COMPILER_WAIT_TIMEOUT_MS = 20_000
// A download carries on after a caller gives up, so the next request can use
// it; past this it is abandoned and the next request starts over.
const COMPILER_DOWNLOAD_TIMEOUT_MS = 90_000
// The largest release (0.7.x asm.js builds) is about 24 MB.
const MAX_COMPILER_BYTES = 64 * 1024 * 1024
// Each compiler holds tens of MB once instantiated; keep the most recent few.
const MAX_CACHED_COMPILERS = 3

type ReleaseListCache = { releases: SolcRelease[] | null; fetchedAt: number }

let releaseListCache: ReleaseListCache | null = null
let releaseListRequest: Promise<SolcRelease[] | null> | null = null

const fetchReleaseList = async (): Promise<SolcRelease[] | null> => {
  try {
    const response = await fetch(RELEASE_LIST_URL, { signal: AbortSignal.timeout(RELEASE_LIST_TIMEOUT_MS) })
    if (!response.ok) {
      throw new Error(`status ${response.status}`)
    }
    const releases = parseReleaseList(await response.json())
    releaseListCache = { fetchedAt: Date.now(), releases }
    return releases
  } catch (error) {
    console.warn("[solc] could not fetch the compiler release list", error)
    // Keep serving a stale list if there is one; either way, retry soon.
    const stale = releaseListCache?.releases ?? null
    releaseListCache = { fetchedAt: Date.now() - RELEASE_LIST_TTL_MS + RELEASE_LIST_RETRY_MS, releases: stale }
    return stale
  }
}

/** Released compilers, newest first, or null when the list is unavailable. */
export const getSolcReleases = (): Promise<SolcRelease[] | null> => {
  if (releaseListCache && Date.now() - releaseListCache.fetchedAt < RELEASE_LIST_TTL_MS) {
    return Promise.resolve(releaseListCache.releases)
  }
  if (!releaseListRequest) {
    releaseListRequest = fetchReleaseList().finally(() => {
      releaseListRequest = null
    })
  }
  return releaseListRequest
}

const downloadSoljson = async (release: SolcRelease): Promise<string> => {
  if (!release.path) {
    throw new Error(`No download path for solc ${release.longVersion}`)
  }
  const response = await fetch(`${BINARIES_URL}/${release.path}`, {
    signal: AbortSignal.timeout(COMPILER_DOWNLOAD_TIMEOUT_MS),
  })
  if (!response.ok) {
    throw new Error(`binaries.soliditylang.org returned ${response.status}`)
  }
  if (Number(response.headers.get("content-length") ?? 0) > MAX_COMPILER_BYTES) {
    throw new Error("compiler download is too large")
  }
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength > MAX_COMPILER_BYTES) {
    throw new Error("compiler download is too large")
  }
  if (release.sha256 && createHash("sha256").update(bytes).digest("hex") !== release.sha256) {
    throw new Error("compiler download does not match the published checksum")
  }
  return new TextDecoder().decode(bytes)
}

const PROCESS_EVENTS = ["uncaughtException", "unhandledRejection"]
const processEvents = process as NodeJS.EventEmitter
const nodeRequire = createRequire(`${process.cwd()}/`)

/**
 * Evaluates a soljson build as a CommonJS module, like require() would.
 * Emscripten installs process-wide handlers that rethrow or abort on any
 * unhandled rejection, which would take down the whole instance; those are
 * removed again.
 */
const instantiateSoljson = (code: string, filename: string): Solc => {
  const listenersBefore = new Map(PROCESS_EVENTS.map((event) => [event, new Set(processEvents.listeners(event))]))
  try {
    const cjsModule = { exports: {} as unknown }
    const factory = runInThisContext(`(function (exports, require, module, __filename, __dirname) {${code}\n})`, {
      filename,
    }) as (...args: unknown[]) => void
    factory.call(cjsModule.exports, cjsModule.exports, nodeRequire, cjsModule, filename, "/")
    return solc.setupMethods(cjsModule.exports)
  } finally {
    for (const event of PROCESS_EVENTS) {
      for (const listener of processEvents.listeners(event)) {
        if (!listenersBefore.get(event)?.has(listener)) {
          processEvents.removeListener(event, listener as (...args: unknown[]) => void)
        }
      }
    }
  }
}

const loadRemoteCompiler = async (release: SolcRelease): Promise<Solc> => {
  const started = Date.now()
  const compiler = instantiateSoljson(await downloadSoljson(release), release.path ?? release.longVersion)
  console.info(`[solc] loaded ${release.longVersion} in ${Date.now() - started}ms`)
  return compiler
}

const withTimeout = <T>(promise: Promise<T>, ms: number, message: string): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new CompilerVersionError(message)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

// Insertion order doubles as recency: a hit is moved to the end.
const compilerCache = new Map<string, Promise<Solc>>()

const getCachedLoad = (release: SolcRelease): Promise<Solc> => {
  const key = release.longVersion
  const cached = compilerCache.get(key)
  if (cached) {
    compilerCache.delete(key)
    compilerCache.set(key, cached)
    return cached
  }

  const load: Promise<Solc> = loadRemoteCompiler(release).catch((error) => {
    // Forget failures so the next request retries.
    if (compilerCache.get(key) === load) {
      compilerCache.delete(key)
    }
    throw error
  })
  compilerCache.set(key, load)
  while (compilerCache.size > MAX_CACHED_COMPILERS) {
    const oldest = compilerCache.keys().next().value
    if (oldest === undefined) {
      break
    }
    compilerCache.delete(oldest)
  }
  return load
}

/** The compiler for `release`: the bundled one, or a cached or freshly downloaded build. */
export const getCompiler = async (release: SolcRelease): Promise<Solc> => {
  if (release.longVersion === BUNDLED_RELEASE.longVersion) {
    return solc
  }

  try {
    return await withTimeout(
      getCachedLoad(release),
      COMPILER_WAIT_TIMEOUT_MS,
      `Downloading the Solidity ${release.version} compiler is taking too long. Try again in a moment, or use pragma solidity ^${BUNDLED_RELEASE.version}, which needs no download.`
    )
  } catch (error) {
    if (error instanceof CompilerVersionError) {
      throw error
    }
    console.error(`[solc] failed to load ${release.longVersion}`, error)
    throw new CompilerVersionError(
      `Could not load the Solidity ${release.version} compiler (${error instanceof Error ? error.message : String(error)}). Try again, or use pragma solidity ^${BUNDLED_RELEASE.version}, which needs no download.`,
      { cause: error }
    )
  }
}

/** Picks the compiler release for a set of sources from their version pragmas. */
export const resolveCompilerRelease = async (sources: Record<string, { content: string }>): Promise<SolcRelease> => {
  const constraints = collectVersionConstraints(sources)
  // Only fetch the release list when the bundled compiler won't do.
  const bundled = getBundledIfSatisfied(constraints)
  if (bundled) {
    return bundled
  }
  return selectCompilerVersion(constraints, await getSolcReleases())
}
