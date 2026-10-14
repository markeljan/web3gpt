import { afterEach, describe, expect, spyOn, test } from "bun:test"
import solc from "solc"
import { findImports, prepareContractSources, resolveImports, rewriteImports } from "@/lib/solidity/utils"

const MULTILINE_IMPORT = `import {
  Ownable,
  Ownable as Owned
} from "@openzeppelin/contracts/access/Ownable.sol";`

describe("import statement syntax", () => {
  test.each([
    ["plain", 'import "./A.sol";', "./A.sol"],
    ["single quotes", "import './A.sol';", "./A.sol"],
    ["aliased unit", 'import "./A.sol" as A;', "./A.sol"],
    ["star alias", 'import * as A from "./A.sol";', "./A.sol"],
    ["named symbols", 'import {A, B as C} from "./A.sol";', "./A.sol"],
    ["multi-line symbols", MULTILINE_IMPORT, "@openzeppelin/contracts/access/Ownable.sol"],
    ["no spaces", 'import{A}from"./A.sol";', "./A.sol"],
    ["space before semicolon", 'import "./A.sol" ;', "./A.sol"],
  ])("finds %s imports", (_, statement, path) => {
    expect(findImports(`pragma solidity ^0.8.0;\n${statement}\ncontract C {}`).map((found) => found.path)).toEqual([
      path,
    ])
  })

  test.each([
    ["plain", 'import "./lib/A.sol";', 'import "A.sol";'],
    ["aliased unit", 'import "./lib/A.sol" as A;', 'import "A.sol" as A;'],
    ["star alias", "import * as A from './lib/A.sol';", 'import * as A from "A.sol";'],
    ["named symbols", 'import {A, B as C} from "./lib/A.sol";', 'import {A, B as C} from "A.sol";'],
    [
      "multi-line symbols",
      MULTILINE_IMPORT,
      MULTILINE_IMPORT.replace("@openzeppelin/contracts/access/Ownable.sol", "Ownable.sol"),
    ],
  ])("rewriting %s imports keeps everything but the path", (_, statement, expected) => {
    expect(rewriteImports(statement, (path) => path.split("/").pop())).toBe(expected)
  })

  test("ignores imports in comments and leaves them untouched", () => {
    const source = `// import "./Commented.sol";
/* import {X} from "./Block.sol"; */
/// @dev see import "./Doc.sol";
import "./Real.sol"; // import "./Trailing.sol";`
    expect(findImports(source).map(({ path }) => path)).toEqual(["./Real.sol"])
    expect(rewriteImports(source, () => "Renamed.sol")).toBe(source.replace('"./Real.sol"', '"Renamed.sol"'))
  })

  test("does not mistake identifiers containing import for statements", () => {
    expect(findImports('contract C { string s; function reimport() public { s = "x"; } }')).toEqual([])
  })
})

describe("prepareContractSources with every import form", () => {
  const localSources = {
    "A.sol":
      "// SPDX-License-Identifier: MIT\npragma solidity ^0.8.0;\nfunction a() pure returns (uint256) { return 1; }\n",
    "C.sol":
      "// SPDX-License-Identifier: MIT\npragma solidity ^0.8.0;\nlibrary C { function c() internal pure returns (uint256) { return 3; } }\n",
    "D.sol":
      "// SPDX-License-Identifier: MIT\npragma solidity ^0.8.0;\nfunction d() pure returns (uint256) { return 4; }\nfunction e() pure returns (uint256) { return 5; }\n",
    "lib/B.sol":
      '// SPDX-License-Identifier: MIT\npragma solidity ^0.8.0;\nimport {a} from "../A.sol";\nfunction b() pure returns (uint256) { return a() + 1; }\n',
  }

  const main = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import "./A.sol";
import "./lib/B.sol" as B;
import * as CMod from "./C.sol";
import {
  d,
  e as five
} from "./D.sol";

contract Main {
  function total() external pure returns (uint256) {
    return a() + B.b() + CMod.C.c() + d() + five();
  }
}
`

  test("resolves each import and keeps its aliases", async () => {
    const sources = await prepareContractSources("Main", main, localSources)

    expect(Object.keys(sources).sort()).toEqual(["A.sol", "B.sol", "C.sol", "D.sol", "Main.sol"])
    const { content } = sources["Main.sol"]
    expect(content).toContain('import "A.sol";')
    expect(content).toContain('import "B.sol" as B;')
    expect(content).toContain('import * as CMod from "C.sol";')
    expect(content).toContain('import {\n  d,\n  e as five\n} from "D.sol";')
    expect(sources["B.sol"].content).toContain('import {a} from "A.sol";')
  })

  test("the rewritten sources compile with the bundled solc", async () => {
    const sources = await prepareContractSources("Main", main, localSources)
    const output = JSON.parse(
      solc.compile(
        JSON.stringify({
          language: "Solidity",
          settings: { outputSelection: { "*": { "*": ["abi"] } } },
          sources,
        })
      )
    ) as { errors?: { severity: string; formattedMessage: string }[]; contracts?: Record<string, unknown> }

    expect(output.errors?.filter(({ severity }) => severity === "error") ?? []).toEqual([])
    expect(Object.keys(output.contracts?.["Main.sol"] ?? {})).toEqual(["Main"])
  })
})

describe("remote resolution of bare package imports", () => {
  const spies: { mockRestore: () => void }[] = []
  afterEach(() => {
    for (const spy of spies.splice(0)) {
      spy.mockRestore()
    }
  })

  const fakeRegistry = (files: Record<string, string>) => {
    const requested: string[] = []
    const spy = spyOn(globalThis, "fetch").mockImplementation(((input: string | URL | Request) => {
      const url = String(input)
      requested.push(url)
      const body = files[url]
      return Promise.resolve(body === undefined ? new Response("not found", { status: 404 }) : new Response(body))
    }) as typeof fetch)
    spies.push(spy)
    return requested
  }

  test("fetches solmate- and forge-std-style imports from unpkg, including their relative imports", async () => {
    const requested = fakeRegistry({
      "https://unpkg.com/forge-std/src/console.sol": "pragma solidity >=0.4.22 <0.9.0;\nlibrary console {}\n",
      "https://unpkg.com/solmate/src/auth/Owned.sol": "pragma solidity >=0.8.0;\nabstract contract Owned {}\n",
      "https://unpkg.com/solmate/src/tokens/ERC20.sol":
        'pragma solidity >=0.8.0;\nimport {Owned} from "../auth/Owned.sol";\nabstract contract ERC20 {}\n',
    })

    const { sourceCode, sources } = await resolveImports(
      `import {ERC20} from "solmate/src/tokens/ERC20.sol";\nimport * as F from "forge-std/src/console.sol";`,
      "Main.sol"
    )

    expect(requested).toEqual([
      "https://unpkg.com/solmate/src/tokens/ERC20.sol",
      "https://unpkg.com/solmate/src/auth/Owned.sol",
      "https://unpkg.com/forge-std/src/console.sol",
    ])
    expect(sourceCode).toBe('import {ERC20} from "ERC20.sol";\nimport * as F from "console.sol";')
    expect(Object.keys(sources).sort()).toEqual(["ERC20.sol", "Owned.sol", "console.sol"])
    expect(sources["ERC20.sol"].content).toContain('import {Owned} from "Owned.sol";')
  })

  test("a host-like bare import is still held to the allowlist", async () => {
    const requested = fakeRegistry({})
    await expect(resolveImports('import "evil.example/x.sol";', "Main.sol")).rejects.toThrow(
      "Imports may only be fetched from"
    )
    expect(requested).toEqual([])
  })

  test("an import used twice is fetched once", async () => {
    const requested = fakeRegistry({ "https://unpkg.com/solmate/src/auth/Owned.sol": "abstract contract Owned {}\n" })
    const { sourceCode } = await resolveImports(
      'import "solmate/src/auth/Owned.sol";\nimport {Owned} from "solmate/src/auth/Owned.sol";',
      "Main.sol"
    )
    expect(requested).toHaveLength(1)
    expect(sourceCode).toBe('import "Owned.sol";\nimport {Owned} from "Owned.sol";')
  })
})
