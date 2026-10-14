import { describe, expect, test } from "bun:test"
import solc from "solc"
import { DEFAULT_COMPILER_VERSION, LEGACY_COMPILER_VERSION } from "@/lib/constants"
import {
  BUNDLED_COMPILER_VERSION,
  CompilerVersionError,
  collectVersionConstraints,
  extractVersionPragmas,
  getEvmVersion,
  getVerificationCompilerVersion,
  parseReleaseList,
  parseVersionPragma,
  type SolcRelease,
  selectCompilerVersion,
} from "@/lib/solidity/compiler-version"

const RELEASE_VERSIONS = [
  "0.3.6",
  "0.4.0",
  "0.4.10",
  "0.4.11",
  "0.4.26",
  "0.5.17",
  "0.6.12",
  "0.7.0",
  "0.7.6",
  "0.8.0",
  "0.8.19",
  "0.8.20",
  "0.8.24",
  "0.8.29",
  "0.8.30",
  "0.8.37",
  // Hypothetical release newer than the bundled compiler.
  "0.8.38",
]

const KNOWN_COMMITS: Record<string, string> = { "0.8.29": "ab55807c", "0.8.37": "f401782d" }

const commitFor = (version: string) =>
  KNOWN_COMMITS[version] ?? version.replaceAll(".", "").padStart(8, "0").slice(0, 8)

const RELEASE_LIST = {
  builds: [
    ...RELEASE_VERSIONS.map((version) => ({
      path: `soljson-v${version}+commit.${commitFor(version)}.js`,
      sha256: `0x${"ab".repeat(32)}`,
      version,
    })),
    {
      path: "soljson-v0.8.39-nightly.2026.10.12+commit.9647b150.js",
      prerelease: "nightly.2026.10.12",
      version: "0.8.39",
    },
  ],
  latestRelease: "0.8.38",
  releases: Object.fromEntries(
    RELEASE_VERSIONS.map((version) => [version, `soljson-v${version}+commit.${commitFor(version)}.js`])
  ),
}

const RELEASES: SolcRelease[] = parseReleaseList(RELEASE_LIST)

/** Resolves the compiler for files given as name -> source. */
const resolve = (files: Record<string, string>, releases: SolcRelease[] | null = RELEASES) =>
  selectCompilerVersion(
    collectVersionConstraints(Object.fromEntries(Object.entries(files).map(([name, content]) => [name, { content }]))),
    releases
  ).version

const pragma = (range: string) => `// SPDX-License-Identifier: MIT\npragma solidity ${range};\ncontract C {}\n`

describe("version pragma extraction", () => {
  test("reads every pragma and normalises whitespace", () => {
    expect(extractVersionPragmas("pragma solidity >=0.8.0;\npragma solidity  <0.9.0 ;\npragma abicoder v2;")).toEqual([
      ">=0.8.0",
      "<0.9.0",
    ])
    expect(extractVersionPragmas("pragma\n  solidity\n  >= 0.7.0\n  < 0.8.0;")).toEqual([">= 0.7.0 < 0.8.0"])
  })

  test("ignores pragmas in comments but not after strings that contain //", () => {
    const source = `// pragma solidity 0.6.0;
/* pragma solidity 0.5.0;
   still a comment */
string constant URL = "https://example.com"; pragma solidity ^0.8.0;
/// @dev pragma solidity 0.4.0;`
    expect(extractVersionPragmas(source)).toEqual(["^0.8.0"])
  })

  test("rejects pragmas that aren't version ranges", () => {
    expect(() => collectVersionConstraints({ "A.sol": { content: "pragma solidity banana;" } })).toThrow(
      CompilerVersionError
    )
    expect(() => collectVersionConstraints({ "A.sol": { content: "pragma solidity ;" } })).toThrow(
      'A.sol has an unsupported Solidity version pragma: "pragma solidity ;"'
    )
  })
})

describe("compiler version selection", () => {
  test.each([
    ["exact", "0.8.20", "0.8.20"],
    ["exact with =", "=0.8.24", "0.8.24"],
    ["exact old release", "0.4.11", "0.4.11"],
    ["caret the bundled compiler satisfies", "^0.8.0", "0.8.37"],
    ["caret above the bundled compiler", "^0.8.38", "0.8.38"],
    ["caret on 0.x stays in the minor", "^0.4.24", "0.4.26"],
    ["caret on 0.7", "^0.7.0", "0.7.6"],
    ["tilde", "~0.7.0", "0.7.6"],
    ["tilde the bundled compiler satisfies", "~0.8.19", "0.8.37"],
    ["range", ">=0.7.0 <0.8.0", "0.7.6"],
    ["range with spaces after operators", ">= 0.6.0 < 0.7.0", "0.6.12"],
    ["upper bound below bundled", ">=0.8.0 <0.8.25", "0.8.24"],
    ["the previously bundled compiler, pinned", "0.8.29", "0.8.29"],
    ["open range", ">=0.4.22", "0.8.37"],
    ["union", "^0.6.0 || ^0.7.0", "0.7.6"],
    ["partial version", "0.8", "0.8.37"],
    ["x-range", "0.7.x", "0.7.6"],
  ])("%s: pragma solidity %s -> %s", (_, range, expected) => {
    expect(resolve({ "Main.sol": pragma(range) })).toBe(expected)
  })

  test("files without a pragma use the bundled compiler", () => {
    expect(resolve({ "Main.sol": "contract C {}" })).toBe("0.8.37")
  })

  test("all pragmas in a file and across files must hold", () => {
    expect(resolve({ "Main.sol": "pragma solidity >=0.8.0;\npragma solidity <0.8.21;" })).toBe("0.8.20")
    expect(resolve({ "Lib.sol": pragma("<0.8.25"), "Main.sol": pragma("^0.8.0") })).toBe("0.8.24")
    expect(resolve({ "Lib.sol": pragma("^0.8.38"), "Main.sol": pragma("^0.8.0") })).toBe("0.8.38")
    expect(
      resolve({ "ERC20.sol": pragma("^0.8.20"), "IERC20.sol": pragma(">=0.4.16"), "Main.sol": pragma("0.8.20") })
    ).toBe("0.8.20")
  })

  test("returns the full version string for verification", () => {
    const release = selectCompilerVersion(
      collectVersionConstraints({ "A.sol": { content: pragma("0.8.20") } }),
      RELEASES
    )
    expect(release).toMatchObject({
      longVersion: "v0.8.20+commit.00000820",
      path: "soljson-v0.8.20+commit.00000820.js",
      sha256: "ab".repeat(32),
    })
  })

  test("conflicting pragmas name the files involved", () => {
    expect(() => resolve({ "ERC20.sol": pragma("^0.8.20"), "Main.sol": pragma("0.8.19") })).toThrow(
      "No released Solidity compiler satisfies every version pragma in this contract and its imports: ERC20.sol (^0.8.20), Main.sol (0.8.19)"
    )
  })

  test("a version that was never released is refused", () => {
    expect(() => resolve({ "Main.sol": pragma("0.8.99") })).toThrow(CompilerVersionError)
    expect(() => resolve({ "Main.sol": pragma("0.8.21") })).toThrow("The newest release is 0.8.38")
  })

  test("versions older than 0.4.11 are refused", () => {
    expect(() => resolve({ "Main.sol": pragma("0.4.10") })).toThrow(
      "Solidity versions older than 0.4.11 are not supported"
    )
    expect(() => resolve({ "Main.sol": pragma("^0.3.0") })).toThrow(CompilerVersionError)
    // Ranges that reach a supported version still resolve to it.
    expect(resolve({ "Main.sol": pragma(">=0.4.0 <0.4.12") })).toBe("0.4.11")
  })

  test("without the release list, only the bundled compiler is available", () => {
    expect(resolve({ "Main.sol": pragma("^0.8.0") }, null)).toBe("0.8.37")
    expect(() => resolve({ "Main.sol": pragma("0.8.20") }, null)).toThrow(
      "the list of compiler releases could not be fetched"
    )
  })
})

// Differential check against the real compiler: for each pragma, the bundled
// solc must accept the file exactly when our range says 0.8.37 satisfies it.
// (solc rejects a few things semver accepts, such as a "v" prefix or
// pre-release tags; solc then reports its own syntax error, so those are left out.)
describe("pragma semantics match the bundled solc", () => {
  const solcAccepts = (range: string) => {
    const output = JSON.parse(
      solc.compile(
        JSON.stringify({
          language: "Solidity",
          settings: { outputSelection: { "*": { "*": [] } } },
          sources: { "A.sol": { content: `pragma solidity ${range};\ncontract C {}` } },
        })
      )
    ) as { errors?: { severity: string }[] }
    return !output.errors?.some(({ severity }) => severity === "error")
  }

  test.each([
    "0.8.37",
    "=0.8.37",
    "0.8.36",
    "0.8",
    "0.8.x",
    "*",
    "^0.8.0",
    "^0.8.38",
    "~0.8.0",
    "~0.8.38",
    ">=0.8.0 <0.9.0",
    ">=0.8.0<0.9.0",
    ">= 0.8.0",
    "> 0.8.36",
    "<0.8.37",
    "0.8.30 - 0.8.38",
    "0.8.36 || 0.8.37",
    "^0.7.0||^0.8.0",
    "0.8.37 0.8.37",
    ">=0.8.38<0.9.0",
    "^0.7.0",
  ])("pragma solidity %s", (range) => {
    expect(parseVersionPragma(range, "A.sol").range.test("0.8.37")).toBe(solcAccepts(range))
  })
})

describe("EVM version", () => {
  test("compilers that support cancun target it, the bundled one included; older ones keep their default", () => {
    const evmFor = (version: string) => getEvmVersion({ longVersion: `v${version}+commit.00000000`, version })
    expect(evmFor("0.8.29")).toBe("cancun")
    expect(evmFor("0.8.24")).toBe("cancun")
    expect(evmFor("0.8.37")).toBe("cancun")
    expect(evmFor("0.8.23")).toBeUndefined()
    expect(evmFor("0.4.26")).toBeUndefined()
  })
})

describe("release list parsing", () => {
  test("keeps releases only, newest first, with checksums", () => {
    expect(RELEASES).toHaveLength(RELEASE_VERSIONS.length)
    expect(RELEASES[0]?.version).toBe("0.8.38")
    expect(RELEASES.at(-1)?.version).toBe("0.3.6")
    expect(RELEASES.some(({ version }) => version === "0.8.39")).toBe(false)
  })

  test("skips entries that don't look like release files", () => {
    const releases = parseReleaseList({
      builds: [],
      releases: {
        "0.8.1": "soljson-v0.8.2+commit.661d1103.js",
        "0.8.2": "../../evil.js",
        "0.8.3": "soljson-v0.8.3+commit.8d00100c.js",
      },
    })
    expect(releases).toEqual([
      {
        longVersion: "v0.8.3+commit.8d00100c",
        path: "soljson-v0.8.3+commit.8d00100c.js",
        sha256: undefined,
        version: "0.8.3",
      },
    ])
    expect(() => parseReleaseList({ releases: {} })).toThrow()
    expect(() => parseReleaseList(null)).toThrow()
  })
})

describe("bundled compiler and verification version", () => {
  test("the bundled solc package is the version we claim", () => {
    expect(solc.version()).toStartWith(BUNDLED_COMPILER_VERSION.slice(1))
    expect(BUNDLED_COMPILER_VERSION).toBe(DEFAULT_COMPILER_VERSION)
  })

  test("records use their own compiler version, and older ones fall back to 0.8.29, which compiled them", () => {
    expect(LEGACY_COMPILER_VERSION).toBe("v0.8.29+commit.ab55807c")
    expect(getVerificationCompilerVersion("v0.8.24+commit.e11b9ed9")).toBe("v0.8.24+commit.e11b9ed9")
    expect(getVerificationCompilerVersion(DEFAULT_COMPILER_VERSION)).toBe(DEFAULT_COMPILER_VERSION)
    expect(getVerificationCompilerVersion(undefined)).toBe(LEGACY_COMPILER_VERSION)
    expect(getVerificationCompilerVersion("")).toBe(LEGACY_COMPILER_VERSION)
    expect(getVerificationCompilerVersion("0.8.24")).toBe(LEGACY_COMPILER_VERSION)
  })
})
