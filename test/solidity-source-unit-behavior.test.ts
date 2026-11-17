import { expect, mock, test } from "bun:test"
import { BUNDLED_RELEASE } from "@/lib/solidity/compiler-version"

mock.module("server-only", () => ({}))

const { compileContractSource } = await import("@/lib/solidity/compile")

const solidity = (source: string) => `// SPDX-License-Identifier: MIT
pragma solidity ${BUNDLED_RELEASE.version};
${source}
`

const mainContract = (value: string) => `contract Main {
  function value() external pure returns (uint256) {
    unchecked {
      return ${value};
    }
  }
}`

const withoutMetadata = (bytecode: string) => {
  // Solidity appends CBOR metadata and ends the bytecode with its two-byte length.
  const metadataBytes = Number.parseInt(bytecode.slice(-4), 16)
  return bytecode.slice(0, -(metadataBytes + 2) * 2)
}

test("nested relative imports with the same basename retain their distinct implementations", async () => {
  const expected = await compileContractSource({
    contractName: "Main",
    sourceCode: solidity(mainContract("102")),
  })
  const actual = await compileContractSource({
    contractName: "Main",
    sourceCode: solidity(`import {left} from "./left/Left.sol";
import {right} from "./right/Right.sol";
${mainContract("left() * 100 + right()")}`),
    sources: {
      "left/Left.sol": solidity(`import {shared} from "./Shared.sol";
function left() pure returns (uint256) { return shared(); }`),
      "left/Shared.sol": solidity("function shared() pure returns (uint256) { return 1; }"),
      "right/Right.sol": solidity(`import {shared} from "./Shared.sol";
function right() pure returns (uint256) { return shared(); }`),
      "right/Shared.sol": solidity("function shared() pure returns (uint256) { return 2; }"),
    },
  })

  // The optimizer folds the call to return 102. A basename collision returns 202.
  expect(withoutMetadata(actual.bytecode)).toBe(withoutMetadata(expected.bytecode))
})
