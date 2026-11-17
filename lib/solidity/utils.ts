import { createHash } from "node:crypto"
import { maskComments } from "@/lib/solidity/source-text"

const OPENZEPPELIN_IMPORT_FALLBACKS: Record<string, string[]> = {
  "@openzeppelin/contracts/security/Pausable.sol": ["@openzeppelin/contracts/utils/Pausable.sol"],
  "@openzeppelin/contracts/security/PullPayment.sol": ["@openzeppelin/contracts/utils/PullPayment.sol"],
  "@openzeppelin/contracts/security/ReentrancyGuard.sol": ["@openzeppelin/contracts/utils/ReentrancyGuard.sol"],
}

// ---------------------------------------------------------------------------
// Import statements. Solidity has four forms, and the symbol list may span
// several lines:
//   import "path";
//   import "path" as Name;
//   import * as Name from "path";
//   import {A, B as C} from "path";
// Imports are found in a copy of the source with comments blanked out, so a
// commented-out import is not fetched. Rewriting only touches the path
// literal, so the `as Name` / `* as Name` / `{A, B}` parts are kept.
// ---------------------------------------------------------------------------

const IMPORT_REGEX =
  /\bimport\s*(?:(?:\{[^}]*\}|\*\s*as\s+[A-Za-z_$][\w$]*)\s*from\s*)?(?<part1>["'])(?<part2>[^"'\r\n]+)\1(?:\s*as\s+[A-Za-z_$][\w$]*)?\s*;/dgu

export type ImportStatement = {
  path: string
  /** Offsets of the path literal, quotes included, in the original source. */
  literalStart: number
  literalEnd: number
}

export const findImports = (source: string): ImportStatement[] =>
  Array.from(maskComments(source).matchAll(IMPORT_REGEX), (match) => {
    const [pathStart, pathEnd] = match.indices?.[2] ?? [0, 0]
    return { literalEnd: pathEnd + 1, literalStart: pathStart - 1, path: match[2] }
  })

/** Replaces the path of every import for which `rename` returns a new path. */
export const rewriteImports = (source: string, rename: (importPath: string) => string | undefined): string => {
  let result = source
  for (const { path, literalStart, literalEnd } of findImports(source).reverse()) {
    const renamed = rename(path)
    if (renamed !== undefined && renamed !== path) {
      result = `${result.slice(0, literalStart)}"${renamed}"${result.slice(literalEnd)}`
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// Remote imports. Contract source comes from users and from the model, and the
// resolver used to fetch whatever an `import` named, so the server could be
// made to request arbitrary URLs. Remote fetches are now restricted to public
// package CDNs and GitHub raw content, over https, with a timeout and caps on
// size and count.
// ---------------------------------------------------------------------------

export const ALLOWED_IMPORT_HOSTS = new Set(["unpkg.com", "cdn.jsdelivr.net", "raw.githubusercontent.com"])
const IMPORT_FETCH_TIMEOUT_MS = 10_000
const MAX_IMPORT_BYTES = 1_000_000
export const MAX_REMOTE_IMPORTS = 200

export class ImportNotAllowedError extends Error {}

/** Throws unless `url` is an https URL on an allowed host. Returns the parsed URL. */
export const assertAllowedImportUrl = (url: string): URL => {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch (error) {
    throw new ImportNotAllowedError(
      `Unsupported import "${url}". Use an npm package path (e.g. @openzeppelin/...) or a GitHub URL.`,
      { cause: error }
    )
  }
  if (parsed.protocol !== "https:" || !ALLOWED_IMPORT_HOSTS.has(parsed.hostname) || parsed.port || parsed.username) {
    throw new ImportNotAllowedError(
      `Imports may only be fetched from ${[...ALLOWED_IMPORT_HOSTS].join(", ")} or github.com over https (got "${url}")`
    )
  }
  return parsed
}

type ImportBudget = { remaining: number }

const fetchRemoteSource = async (url: URL, budget: ImportBudget): Promise<Response> => {
  budget.remaining -= 1
  if (budget.remaining < 0) {
    throw new ImportNotAllowedError(`Too many remote imports (limit ${MAX_REMOTE_IMPORTS})`)
  }

  const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(IMPORT_FETCH_TIMEOUT_MS) })
  // unpkg redirects to versioned paths; make sure a redirect didn't leave the allowlist.
  if (response.url) {
    assertAllowedImportUrl(response.url)
  }
  const declaredLength = Number(response.headers.get("content-length") ?? 0)
  if (declaredLength > MAX_IMPORT_BYTES) {
    throw new ImportNotAllowedError(`Import ${url} is too large`)
  }
  return response
}

const readLimitedText = async (response: Response, url: string): Promise<string> => {
  const text = await response.text()
  if (text.length > MAX_IMPORT_BYTES) {
    throw new ImportNotAllowedError(`Import ${url} is too large`)
  }
  return text
}

type ImportResolution = {
  budget: ImportBudget
  generatedDirectory: string
  localPaths: Set<string>
  localSources: Record<string, string>
  localUnits: Map<string, string>
  remoteUnits: Map<string, string>
  sources: Map<string, { content: string }>
}

const PORTABLE_PATH_SEGMENT = /^(?!\.{1,2}$)[\w.@$+-]+$/u
const TRAILING_SLASHES = /\/+$/u
// ipfsUploadDir adds these files alongside the source bundle.
const ARTIFACT_FILES = ["abi.json", "bytecode.txt", "standardJsonInput.json"]

function isPortableLocalPath(path: string, localPaths: Set<string>) {
  const segments = path.split("/")
  let parent = ""
  for (const segment of segments) {
    if (!PORTABLE_PATH_SEGMENT.test(segment) || localPaths.has(parent)) {
      return false
    }
    parent = parent ? `${parent}/${segment}` : segment
  }
  return !ARTIFACT_FILES.includes(path)
}

// Keep ordinary local paths in the source bundle. URLs and other VFS names
// that cannot be used as archive paths get stable names within a free directory.
function generatedSourceUnit(resolution: ImportResolution, identity: string, path: string) {
  const digest = createHash("sha256").update(identity).digest("hex")
  const basename = path.split("/").at(-1)
  const fileName = basename && PORTABLE_PATH_SEGMENT.test(basename) ? basename : "source.sol"
  return `${resolution.generatedDirectory}/${digest}/${fileName}`
}

export async function resolveImports(sourceCode: string, sourcePath = "", localSources: Record<string, string> = {}) {
  const localPaths = new Set([...ARTIFACT_FILES, ...Object.keys(localSources)])
  if (sourcePath) {
    localPaths.add(sourcePath)
  }
  const rootSegments = new Set(Array.from(localPaths, (path) => path.split("/")[0]))
  let generatedDirectory = "imports"
  while (rootSegments.has(generatedDirectory)) {
    generatedDirectory = `_${generatedDirectory}`
  }
  const resolution: ImportResolution = {
    budget: { remaining: MAX_REMOTE_IMPORTS },
    generatedDirectory,
    localPaths,
    localSources,
    // Register the entry point first so imports can refer to it without overwriting it.
    localUnits: new Map(sourcePath ? [[sourcePath, sourcePath]] : []),
    remoteUnits: new Map(),
    sources: new Map(),
  }
  const rewritten = await rewriteResolvedImports(sourceCode, sourcePath, resolution)
  return { sourceCode: rewritten, sources: Object.fromEntries(resolution.sources) }
}

async function rewriteResolvedImports(sourceCode: string, sourcePath: string | URL, resolution: ImportResolution) {
  const importPaths = new Set(findImports(sourceCode).map(({ path }) => path))
  const renamed = new Map<string, string>()
  for (const importPath of importPaths) {
    // biome-ignore lint/performance/noAwaitInLoops: resolve in order against one source registry and fetch budget
    const name = await resolveImport(importPath, sourcePath, resolution)
    renamed.set(importPath, name)
  }
  return rewriteImports(sourceCode, (importPath) => renamed.get(importPath))
}

async function resolveImport(
  importPath: string,
  sourcePath: string | URL,
  resolution: ImportResolution
): Promise<string> {
  // Match local source-unit names before interpreting the import as a network URL.
  const localBase = typeof sourcePath === "string" ? sourcePath : `${sourcePath.origin}${sourcePath.pathname}`
  const localPath = isRelativeImport(importPath) ? resolveImportPath(importPath, localBase) : importPath
  const localUnit = resolution.localUnits.get(localPath)
  if (localUnit !== undefined) {
    return localUnit
  }
  if (Object.hasOwn(resolution.localSources, localPath)) {
    const name = isPortableLocalPath(localPath, resolution.localPaths)
      ? localPath
      : generatedSourceUnit(resolution, `local:${localPath}`, localPath)
    resolution.localUnits.set(localPath, name)
    const content = await rewriteResolvedImports(resolution.localSources[localPath], localPath, resolution)
    resolution.sources.set(name, { content })
    return name
  }

  const importCandidates = [importPath, ...getImportFallbacks(importPath)]
  let lastError: Error | undefined

  for (const importCandidate of importCandidates) {
    const url = assertAllowedImportUrl(getImportUrl(importCandidate, String(sourcePath)))
    const remoteUnit = resolution.remoteUnits.get(url.href)
    if (remoteUnit !== undefined) {
      return remoteUnit
    }
    // biome-ignore lint/performance/noAwaitInLoops: fallbacks are tried in order, stopping at the first that exists
    const response = await fetchRemoteSource(url, resolution.budget)

    if (!response.ok) {
      lastError = new Error(`HTTP error! status: ${response.status} while fetching ${importCandidate}`)
      continue
    }

    return resolveRemoteImport(response, url, resolution)
  }

  throw lastError || new Error(`Unable to resolve import: ${importPath}`)
}

async function resolveRemoteImport(response: Response, url: URL, resolution: ImportResolution) {
  const name = generatedSourceUnit(resolution, `remote:${url.href}`, url.pathname)
  resolution.remoteUnits.set(url.href, name)
  const sourceCode = await readLimitedText(response, url.href)
  // Keep relative imports based on the requested location, including fallback paths.
  const content = await rewriteResolvedImports(sourceCode, url, resolution)
  resolution.sources.set(name, { content })
  return name
}

const isRelativeImport = (path: string) => path.startsWith("./") || path.startsWith("../")
function withoutLastSegment(path: string) {
  const slash = path.lastIndexOf("/")
  return slash === 0 && path.length > 1 ? "/" : path.slice(0, Math.max(slash, 0)).replace(TRAILING_SLASHES, "")
}

function resolveImportPath(importPath: string, sourcePath: string) {
  // Normalize the relative import. Preserve the importing unit's prefix,
  // which can contain unnormalized segments from a direct import.
  let path = withoutLastSegment(sourcePath)
  for (const segment of importPath.split("/")) {
    if (segment === "..") {
      path = withoutLastSegment(path)
    } else if (segment && segment !== ".") {
      path = path && path !== "/" ? `${path}/${segment}` : `${path}${segment}`
    }
  }
  return path
}

// First segment of an npm package path such as "solmate/src/tokens/ERC20.sol"
// or "forge-std/Test.sol": a lowercase package name with no dots (so it can't
// be a host name), followed by a path inside the package.
const BARE_PACKAGE_IMPORT = /^[a-z0-9][a-z0-9_-]{0,213}\/[^/]/u

const GITHUB_BLOB_URL = /^(?:https:\/\/)?(?:www\.)?github\.com\/(?<part1>[^/]+)\/(?<part2>[^/]+)\/blob\/(?<part3>.+)$/u
const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//iu

export function getImportUrl(importPath: string, sourcePath?: string) {
  let urlToFetch: string

  if (isRelativeImport(importPath) && sourcePath) {
    urlToFetch = SCHEME.test(sourcePath)
      ? new URL(importPath, sourcePath).href
      : resolveImportPath(importPath, sourcePath)
  } else if (importPath[0] === "@" || BARE_PACKAGE_IMPORT.test(importPath)) {
    urlToFetch = `https://unpkg.com/${importPath}`
  } else {
    urlToFetch = importPath
  }

  // github.com/<owner>/<repo>/blob/<ref>/<path>  ->  raw.githubusercontent.com/<owner>/<repo>/<ref>/<path>
  const blob = urlToFetch.match(GITHUB_BLOB_URL)
  if (blob) {
    return `https://raw.githubusercontent.com/${blob[1]}/${blob[2]}/${blob[3]}`
  }

  // Allow scheme-less "raw.githubusercontent.com/..." style imports.
  if (!SCHEME.test(urlToFetch)) {
    return `https://${urlToFetch}`
  }

  return urlToFetch
}

function getImportFallbacks(importPath: string) {
  if (Object.hasOwn(OPENZEPPELIN_IMPORT_FALLBACKS, importPath)) {
    return OPENZEPPELIN_IMPORT_FALLBACKS[importPath]
  }

  if (importPath.includes("/draft-")) {
    return [importPath.replace("/draft-", "/")]
  }

  return []
}

const CONTRACT_NAME_REGEX = /[/\\:*?"<>|.\s]+$/gu

export const getContractFileName = (contractName: string): string =>
  `${contractName.replace(CONTRACT_NAME_REGEX, "_")}.sol`

export async function prepareContractSources(
  contractName: string,
  sourceCode: string,
  localSources?: Record<string, string>
) {
  const fileName = getContractFileName(contractName)

  const resolved = await resolveImports(sourceCode, fileName, localSources)
  return {
    [fileName]: {
      content: resolved.sourceCode,
    },
    ...resolved.sources,
  }
}
