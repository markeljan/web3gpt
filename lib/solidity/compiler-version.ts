import semver from "semver"
import { DEFAULT_COMPILER_VERSION } from "@/lib/constants"
import { maskComments } from "@/lib/solidity/source-text"

// Picks the solc release a compilation should use from the `pragma solidity`
// lines of every file in it. Everything here is pure; fetching the release
// list and loading compilers lives in lib/solidity/solc-loader.ts.
//
// Solidity version pragmas use npm semver range syntax: `0.8.20` is exact,
// `^0.8.0` and `~0.8.1` work as in npm, comparators separated by spaces are
// ANDed and `||` ORs ranges. Several pragmas, in one file or across files, must
// all hold, so they are ANDed too.

/** Full version string of the solc build bundled with the `solc` npm package. */
export const BUNDLED_COMPILER_VERSION = DEFAULT_COMPILER_VERSION

/**
 * The oldest release we will load. Standard JSON input, which the compiler
 * call and explorer verification both rely on, arrived in 0.4.11.
 */
export const MIN_COMPILER_VERSION = "0.4.11"

const PRAGMA_REGEX = /\bpragma\s+solidity\s+([^;]*);/g
const LONG_VERSION_REGEX = /^v(\d+\.\d+\.\d+)\+commit\.[0-9a-f]{8}$/
const RELEASE_FILE_REGEX = /^soljson-(v\d+\.\d+\.\d+\+commit\.[0-9a-f]{8})\.js$/
const ADJACENT_COMPARATOR_REGEX = /([\dxX*])(?=[<>=^~])/g
const SHA256_REGEX = /^(?:0x)?[0-9a-f]{64}$/i
const HEX_PREFIX_REGEX = /^0x/

/** Raised for version problems the model should relay to the user as-is. */
export class CompilerVersionError extends Error {}

export type VersionConstraint = {
  file: string
  pragma: string
  range: semver.Range
}

/** A released compiler: `version` is "0.8.24", `longVersion` is "v0.8.24+commit.e11b9ed9". */
export type SolcRelease = {
  version: string
  longVersion: string
  /** File name under https://binaries.soliditylang.org/bin/, e.g. "soljson-v0.8.24+commit.e11b9ed9.js". */
  path?: string
  /** Hex sha256 of that file, as published in the release list. */
  sha256?: string
}

export const isLongVersion = (value: unknown): value is string =>
  typeof value === "string" && LONG_VERSION_REGEX.test(value)

/**
 * Compiler version to send with an explorer verification. Records queued
 * before compiler selection existed have none; they were all compiled with
 * the bundled compiler.
 */
export const getVerificationCompilerVersion = (compilerVersion: unknown): string =>
  isLongVersion(compilerVersion) ? compilerVersion : DEFAULT_COMPILER_VERSION

export const toRelease = (longVersion: string): SolcRelease => {
  const match = longVersion.match(LONG_VERSION_REGEX)
  if (!match) {
    throw new Error(`Not a solc release version: ${longVersion}`)
  }
  return { longVersion, version: match[1] }
}

export const BUNDLED_RELEASE = toRelease(BUNDLED_COMPILER_VERSION)

/** The text of every `pragma solidity ...;` in `source`, ignoring comments. */
export const extractVersionPragmas = (source: string): string[] =>
  Array.from(maskComments(source).matchAll(PRAGMA_REGEX), (match) => match[1].trim().replace(/\s+/g, " "))

/**
 * solc accepts comparators written without a space between them
 * (`>=0.8.0<0.9.0`), which npm semver does not parse. Insert the space.
 */
const toSemverRange = (pragma: string) => pragma.replace(ADJACENT_COMPARATOR_REGEX, "$1 ")

export const parseVersionPragma = (pragma: string, file: string): VersionConstraint => {
  const normalized = toSemverRange(pragma)
  const range = semver.validRange(normalized) === null ? null : new semver.Range(normalized)
  if (!(pragma && range)) {
    throw new CompilerVersionError(`${file} has an unsupported Solidity version pragma: "pragma solidity ${pragma};"`)
  }
  return { file, pragma, range }
}

export const collectVersionConstraints = (sources: Record<string, { content: string }>): VersionConstraint[] =>
  Object.entries(sources).flatMap(([file, { content }]) =>
    extractVersionPragmas(content).map((pragma) => parseVersionPragma(pragma, file))
  )

export const satisfiesAll = (version: string, constraints: VersionConstraint[]) =>
  constraints.every(({ range }) => range.test(version))

/** Release list from https://binaries.soliditylang.org/bin/list.json, newest first. Nightlies are skipped. */
export const parseReleaseList = (list: unknown): SolcRelease[] => {
  const { builds, releases } = (typeof list === "object" && list !== null ? list : {}) as {
    builds?: unknown
    releases?: unknown
  }
  if (typeof releases !== "object" || releases === null) {
    throw new Error("Solidity release list has no releases")
  }

  const checksums = new Map<string, string>()
  for (const build of Array.isArray(builds) ? builds : []) {
    const { path, sha256 } = (build ?? {}) as { path?: unknown; sha256?: unknown }
    if (typeof path === "string" && typeof sha256 === "string" && SHA256_REGEX.test(sha256)) {
      checksums.set(path, sha256.replace(HEX_PREFIX_REGEX, "").toLowerCase())
    }
  }

  const parsed: SolcRelease[] = []
  for (const [version, file] of Object.entries(releases)) {
    const match = typeof file === "string" ? file.match(RELEASE_FILE_REGEX) : null
    if (match && semver.valid(version) && toRelease(match[1]).version === version) {
      parsed.push({ longVersion: match[1], path: match[0], sha256: checksums.get(match[0]), version })
    }
  }
  if (parsed.length === 0) {
    throw new Error("Solidity release list has no releases")
  }
  return parsed.sort((a, b) => semver.rcompare(a.version, b.version))
}

const describeConstraints = (constraints: VersionConstraint[]) => {
  const seen = new Set<string>()
  const parts: string[] = []
  for (const { file, pragma } of constraints) {
    const part = `${file} (${pragma})`
    if (!seen.has(part)) {
      seen.add(part)
      parts.push(part)
    }
  }
  return parts.join(", ")
}

/**
 * The EVM version every compile targets: the bundled compiler's default, which
 * is what the supported chains have been running. Newer compilers default to
 * prague (0.8.30) or osaka (0.8.31+), which not every chain supports, and
 * 0.8.24 defaults to shanghai, which rejects the `mcopy` that current
 * OpenZeppelin code (pragma ^0.8.24) uses.
 */
export const TARGET_EVM_VERSION = "cancun"
const FIRST_CANCUN_COMPILER = "0.8.24"

/** `evmVersion` setting for a release, or undefined to keep an older compiler's own default. */
export const getEvmVersion = (release: SolcRelease): string | undefined =>
  semver.gte(release.version, FIRST_CANCUN_COMPILER) ? TARGET_EVM_VERSION : undefined

/** The bundled compiler, when it satisfies every pragma. No network needed. */
export const getBundledIfSatisfied = (constraints: VersionConstraint[]): SolcRelease | null =>
  satisfiesAll(BUNDLED_RELEASE.version, constraints) ? BUNDLED_RELEASE : null

/**
 * Chooses the compiler for a compilation. The bundled compiler wins whenever
 * it satisfies the pragmas; otherwise the newest release that satisfies all of
 * them. `releases` is null when the release list could not be fetched.
 */
export const selectCompilerVersion = (
  constraints: VersionConstraint[],
  releases: SolcRelease[] | null
): SolcRelease => {
  const bundled = getBundledIfSatisfied(constraints)
  if (bundled) {
    return bundled
  }

  const pragmas = describeConstraints(constraints)
  if (!releases) {
    throw new CompilerVersionError(
      `The Solidity version pragmas require a compiler other than the bundled ${BUNDLED_RELEASE.version}, and the list of compiler releases could not be fetched. Try again shortly, or use pragma solidity ^${BUNDLED_RELEASE.version}. Pragmas: ${pragmas}`
    )
  }

  const matching = releases.filter(({ version }) => satisfiesAll(version, constraints))
  const supported = matching.filter(({ version }) => semver.gte(version, MIN_COMPILER_VERSION))
  if (supported.length > 0) {
    return supported.reduce((newest, release) => (semver.gt(release.version, newest.version) ? release : newest))
  }

  if (matching.length > 0) {
    throw new CompilerVersionError(
      `Solidity versions older than ${MIN_COMPILER_VERSION} are not supported, and the pragmas only allow ${matching[0]?.version} or older: ${pragmas}. Update the pragma to a newer version, ideally ^${BUNDLED_RELEASE.version}.`
    )
  }

  throw new CompilerVersionError(
    `No released Solidity compiler satisfies every version pragma in this contract and its imports: ${pragmas}. The newest release is ${releases[0]?.version}. Adjust the pragmas so they overlap, ideally to ^${BUNDLED_RELEASE.version}.`
  )
}
