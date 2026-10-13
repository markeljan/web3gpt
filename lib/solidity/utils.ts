import { maskComments } from "@/lib/solidity/source-text"

const LOCAL_IMPORT_REGEX = /^\.\//
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
  /\bimport\s*(?:(?:\{[^}]*\}|\*\s*as\s+[A-Za-z_$][\w$]*)\s*from\s*)?(["'])([^"'\r\n]+)\1(?:\s*as\s+[A-Za-z_$][\w$]*)?\s*;/dg

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

const fetchRemoteSource = async (url: string, budget: ImportBudget): Promise<Response> => {
  assertAllowedImportUrl(url)
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

export async function resolveImports(
  sourceCode: string,
  sourcePath?: string,
  localSources?: Record<string, string>,
  budget: ImportBudget = { remaining: MAX_REMOTE_IMPORTS }
) {
  const sources: { [fileName: string]: { content: string } } = {}
  const importPaths = new Set(findImports(sourceCode).map(({ path }) => path))
  const renamed = new Map<string, string>()
  for (const importPath of importPaths) {
    const { sources: importedSources, sourceCode: mainSourceCode } = await fetchImport(
      importPath,
      sourcePath,
      localSources,
      budget
    )

    // Merge the imported sources into the main sources object
    Object.assign(sources, importedSources)

    let sourceFileName = importPath.split("/").pop() || importPath

    // if sources[sourceFileName] already exists and the content is the same, then skip, otherwise change the sourceFileName to keep the folder structure but still be a relative path
    if (sources[sourceFileName] && sources[sourceFileName].content !== mainSourceCode) {
      sourceFileName = importPath.split("/").slice(-2).join("/")
    }

    sources[sourceFileName] = {
      content: mainSourceCode,
    }
    renamed.set(importPath, sourceFileName)
  }
  return { sourceCode: rewriteImports(sourceCode, (importPath) => renamed.get(importPath)), sources }
}

async function fetchImport(
  importPath: string,
  sourcePath: string | undefined,
  localSources: Record<string, string> | undefined,
  budget: ImportBudget
) {
  // Check if the import exists in provided local sources
  if (localSources) {
    let localPath = importPath
    if (importPath[0] === "." && sourcePath) {
      localPath = resolveImportPath(importPath, sourcePath)
    }
    localPath = localPath.replace(LOCAL_IMPORT_REGEX, "")
    if (localSources[localPath]) {
      const importedSource = localSources[localPath]
      const { sources: importedSources, sourceCode: importedSourceCode } = await resolveImports(
        importedSource,
        localPath,
        localSources,
        budget
      )
      return { sourceCode: importedSourceCode, sources: importedSources }
    }
  }

  const importCandidates = [importPath, ...getImportFallbacks(importPath)]
  let lastError: Error | undefined

  for (const importCandidate of importCandidates) {
    const urlToFetch = getImportUrl(importCandidate, sourcePath)
    const response = await fetchRemoteSource(urlToFetch, budget)

    if (!response.ok) {
      lastError = new Error(`HTTP error! status: ${response.status} while fetching ${importCandidate}`)
      continue
    }

    const importedSource = await readLimitedText(response, urlToFetch)

    // Handle any imports within the fetched source code
    const { sources, sourceCode } = await resolveImports(importedSource, urlToFetch, localSources, budget)

    return { sourceCode, sources }
  }

  throw lastError || new Error(`Unable to resolve import: ${importPath}`)
}

/// utility function to handle relative paths
function resolveImportPath(importPath: string, sourcePath: string) {
  const importSegments = importPath.split("/")
  const sourceSegments = sourcePath.split("/")

  // Remove the last segment (file name) from the source path
  sourceSegments.pop()

  // Process each segment of the import path
  while (importSegments.length > 0 && importSegments[0] === "..") {
    // Remove one directory level for each '..'
    sourceSegments.pop()
    importSegments.shift()
  }

  // Special handling for './'
  if (importSegments.length > 0 && importSegments[0] === ".") {
    importSegments.shift()
  }

  // Reconstruct the final path
  return sourceSegments.concat(importSegments).join("/")
}

// First segment of an npm package path such as "solmate/src/tokens/ERC20.sol"
// or "forge-std/Test.sol": a lowercase package name with no dots (so it can't
// be a host name), followed by a path inside the package.
const BARE_PACKAGE_IMPORT = /^[a-z0-9][a-z0-9_-]{0,213}\/[^/]/

const GITHUB_BLOB_URL = /^(?:https:\/\/)?(?:www\.)?github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/
const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i

export function getImportUrl(importPath: string, sourcePath?: string) {
  let urlToFetch: string

  if (importPath[0] === "." && sourcePath) {
    urlToFetch = resolveImportPath(importPath, sourcePath)
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
  const explicitFallbacks = OPENZEPPELIN_IMPORT_FALLBACKS[importPath]
  if (explicitFallbacks) {
    return explicitFallbacks
  }

  if (importPath.includes("/draft-")) {
    return [importPath.replace("/draft-", "/")]
  }

  return []
}

const CONTRACT_NAME_REGEX = /[/\\:*?"<>|.\s]+$/g

export const getContractFileName = (contractName: string): string =>
  `${contractName.replace(CONTRACT_NAME_REGEX, "_")}.sol`

export async function prepareContractSources(
  contractName: string,
  sourceCode: string,
  localSources?: Record<string, string>
) {
  const fileName = getContractFileName(contractName)

  const handleImportsResult = await resolveImports(sourceCode, fileName, localSources)

  const sources = {
    [fileName]: {
      content: handleImportsResult?.sourceCode,
    },
    ...handleImportsResult?.sources,
  }

  // Every file is now stored under a flat name. Point any import that doesn't
  // already name one of those files at its bare file name.
  for (const source of Object.values(sources)) {
    source.content = rewriteImports(source.content, (importPath) =>
      sources[importPath] ? undefined : importPath.split("/").pop() || importPath
    )
  }

  return sources
}
