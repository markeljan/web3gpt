import { afterEach, describe, expect, spyOn, test } from "bun:test"
import solc from "solc"
import {
  findImports,
  MAX_REMOTE_IMPORTS,
  prepareContractSources,
  resolveImports,
  rewriteImports,
} from "@/lib/solidity/utils"

test("preserves import offsets after astral characters in comments", () => {
  const source = '/* 😀 */ import "./A.sol";'
  const plain = '         import "./A.sol";'
  expect(findImports(source)).toEqual(findImports(plain))
})

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

    expect(Object.keys(sources).sort()).toEqual(["A.sol", "C.sol", "D.sol", "Main.sol", "lib/B.sol"])
    const { content } = sources["Main.sol"]
    expect(content).toContain('import "A.sol";')
    expect(content).toContain('import "lib/B.sol" as B;')
    expect(content).toContain('import * as CMod from "C.sol";')
    expect(content).toContain('import {\n  d,\n  e as five\n} from "D.sol";')
    expect(sources["lib/B.sol"].content).toContain('import {a} from "A.sol";')
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

test("keeps direct source names distinct while normalizing relative import segments", async () => {
  const sources = await prepareContractSources(
    "Main",
    'import "./lib/child/../Main.sol" as Nested; import "lib//Main.sol" as Literal;',
    {
      "lib//Main.sol": "library Literal {}",
      "lib/Empty.sol": "",
      "lib/Main.sol": 'import "../Main.sol" as Root; import "./Empty.sol"; library Nested {}',
    }
  )

  const [nested, literal] = findImports(sources["Main.sol"].content)
  expect(nested.path).toBe("lib/Main.sol")
  expect(literal.path).not.toBe(nested.path)
  expect(sources[literal.path].content).toBe("library Literal {}")
  expect(sources[nested.path].content).toBe('import "Main.sol" as Root; import "lib/Empty.sol"; library Nested {}')
  expect(sources["lib/Empty.sol"].content).toBe("")
})

const spies: { mockRestore: () => void }[] = []
afterEach(() => {
  for (const spy of spies.splice(0)) {
    spy.mockRestore()
  }
})

const fakeRegistry = (files: Record<string, string | { body: string; finalUrl: string }>) => {
  const requested: string[] = []
  const spy = spyOn(globalThis, "fetch").mockImplementation(((input: string | URL | Request) => {
    const url = String(input)
    requested.push(url)
    const file = files[url]
    if (file === undefined) {
      return Promise.resolve(new Response("not found", { status: 404 }))
    }
    if (typeof file === "string") {
      return Promise.resolve(new Response(file))
    }
    const response = new Response(file.body)
    Object.defineProperty(response, "url", { value: file.finalUrl })
    return Promise.resolve(response)
  }) as typeof fetch)
  spies.push(spy)
  return requested
}

test("preserves relative lookup for absolute and URL-shaped local source names", async () => {
  const requested = fakeRegistry({})
  const sources = await prepareContractSources(
    "Main",
    'import "/Left.sol"; import "https://unpkg.com/pkg/Parent.sol";',
    {
      "/Left.sol": 'import "./Shared.sol";',
      "/Shared.sol": "library AbsoluteShared {}",
      "https://unpkg.com/pkg/Child File.sol": "library LocalChild {}",
      "https://unpkg.com/pkg/Parent.sol": 'import "./Child File.sol";',
      "Shared.sol": "library UnrelatedShared {}",
    }
  )

  const [left, parent] = findImports(sources["Main.sol"].content)
  const [shared] = findImports(sources[left.path].content)
  const [child] = findImports(sources[parent.path].content)
  expect(sources[shared.path].content).toBe("library AbsoluteShared {}")
  expect(sources[child.path].content).toBe("library LocalChild {}")
  expect(requested).toEqual([])
  const names = Object.keys(sources)
  expect(names).toHaveLength(5)
  expect(names.every((name) => !(name.startsWith("/") || name.includes("://")))).toBe(true)
})

test("keeps source names from colliding with files in the artifact directory", async () => {
  const sources = await prepareContractSources("Main", 'import "lib.sol"; import "lib.sol/Nested.sol";', {
    "lib.sol": "library Library {}",
    "lib.sol/Nested.sol": "library Nested {}",
  })

  const [file, nested] = findImports(sources["Main.sol"].content)
  expect(file.path).toBe("lib.sol")
  expect(nested.path.startsWith("lib.sol/")).toBe(false)
  expect(sources[nested.path].content).toBe("library Nested {}")
})

describe("remote source resolution", () => {
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
    const [erc20, console] = findImports(sourceCode)
    const [owned] = findImports(sources[erc20.path].content)
    expect(sourceCode).toBe(`import {ERC20} from "${erc20.path}";\nimport * as F from "${console.path}";`)
    expect(Object.keys(sources).sort()).toEqual([erc20.path, owned.path, console.path].sort())
    expect(sources[owned.path].content).toContain("abstract contract Owned")
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
    const [first, second] = findImports(sourceCode)
    expect(first.path).toBe(second.path)
    expect(sourceCode).toBe(`import "${first.path}";\nimport {Owned} from "${first.path}";`)
  })

  test("keeps distinct GitHub imports and an explicit local URL override separate", async () => {
    const firstUrl = "https://raw.githubusercontent.com/acme/solidity/main/left/Shared.sol"
    const secondUrl = "https://raw.githubusercontent.com/acme/solidity/main/right/Shared.sol"
    const requested = fakeRegistry({ [firstUrl]: "library RemoteLeft {}", [secondUrl]: "library RemoteRight {}" })
    const result = await resolveImports(
      `import "https://github.com/acme/solidity/blob/main/left/Shared.sol" as Left;
import "raw.githubusercontent.com/acme/solidity/main/right/Shared.sol" as Right;
import "${firstUrl}" as Local;`,
      "Main.sol",
      { [firstUrl]: "library LocalLeft {}" }
    )
    const names = findImports(result.sourceCode).map(({ path }) => path)

    expect(requested).toEqual([firstUrl, secondUrl])
    expect(new Set(names).size).toBe(3)
    expect(names.map((name) => result.sources[name].content)).toEqual([
      "library RemoteLeft {}",
      "library RemoteRight {}",
      "library LocalLeft {}",
    ])
  })

  test("resolves dependencies relative to the requested fallback even when it redirects", async () => {
    const base = "https://unpkg.com/@openzeppelin/contracts"
    const final = "https://unpkg.com/@openzeppelin/contracts@5.6.0/utils"
    const requested = fakeRegistry({
      [`${base}/utils/Context.sol`]: "abstract contract Context {}",
      [`${base}/utils/Pausable.sol`]: {
        body: 'import "./Context.sol"; abstract contract Pausable {}',
        finalUrl: `${final}/Pausable.sol?source=/raw/file`,
      },
    })
    const { sourceCode, sources } = await resolveImports(
      'import "@openzeppelin/contracts/security/Pausable.sol"; import "@openzeppelin/contracts/utils/Pausable.sol" as Alias;',
      "Main.sol"
    )
    const [primary, alias] = findImports(sourceCode)
    const [context] = findImports(sources[primary.path].content)

    expect(requested).toEqual([
      `${base}/security/Pausable.sol`,
      `${base}/utils/Pausable.sol`,
      `${base}/utils/Context.sol`,
    ])
    expect(primary.path).toBe(alias.path)
    expect(sources[context.path].content).toBe("abstract contract Context {}")
  })

  test("counts unsuccessful remote fetches against the shared import budget", async () => {
    const base = "https://unpkg.com"
    const imports = Array.from({ length: MAX_REMOTE_IMPORTS - 1 }, (_, index) => `package/Unit${index}.sol`)
    const requested = fakeRegistry(Object.fromEntries(imports.map((path) => [`${base}/${path}`, ""])))
    const sourceCode = [...imports, "@openzeppelin/contracts/security/Pausable.sol"]
      .map((path) => `import "${path}";`)
      .join("\n")

    await expect(resolveImports(sourceCode, "Main.sol")).rejects.toThrow(`limit ${MAX_REMOTE_IMPORTS}`)
    expect(requested).toHaveLength(MAX_REMOTE_IMPORTS)
    expect(requested.at(-1)).toBe(`${base}/@openzeppelin/contracts/security/Pausable.sol`)
  })
})
