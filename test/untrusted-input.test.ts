import { describe, expect, test } from "bun:test"
import { assertAllowedImportUrl, getImportUrl, ImportNotAllowedError } from "@/lib/solidity/utils"
import { verifyWalletDeployment, WalletDeploymentMismatchError } from "@/lib/solidity/wallet-deployment"

const BYTECODE = "0x6080604052"
const ARGS = "000000000000000000000000000000000000000000000000000000000000002a"

const evidence = (
  overrides: { input?: string; to?: string | null; status?: "success" | "reverted"; address?: string | null } = {}
) => ({
  receipt: {
    contractAddress: (overrides.address === undefined
      ? "0xC0FFEE0000000000000000000000000000000001"
      : overrides.address) as `0x${string}` | null,
    status: overrides.status ?? "success",
    transactionHash: "0xabc" as `0x${string}`,
  },
  transaction: {
    from: "0xDeAd000000000000000000000000000000000002" as `0x${string}`,
    input: (overrides.input ?? `${BYTECODE}${ARGS}`) as `0x${string}`,
    to: (overrides.to === undefined ? null : overrides.to) as `0x${string}` | null,
  },
})

describe("wallet deployment verification", () => {
  test("derives address, deployer and constructor args from the chain", () => {
    expect(verifyWalletDeployment(evidence(), { artifactBytecode: BYTECODE })).toEqual({
      contractAddress: "0xC0FFEE0000000000000000000000000000000001",
      deployerAddress: "0xDeAd000000000000000000000000000000000002",
      encodedConstructorArgs: ARGS,
    })
  })

  test("accepts a matching claimed address regardless of case", () => {
    expect(() =>
      verifyWalletDeployment(evidence(), {
        artifactBytecode: BYTECODE,
        claimedContractAddress: "0xc0ffee0000000000000000000000000000000001",
      })
    ).not.toThrow()
  })

  test.each([
    ["a reverted transaction", evidence({ status: "reverted" })],
    ["a call to an existing contract", evidence({ to: "0x0000000000000000000000000000000000000003" })],
    ["a receipt without a created contract", evidence({ address: null })],
    ["different bytecode", evidence({ input: `0x6000${ARGS}` })],
  ])("rejects %s", (_, chainEvidence) => {
    expect(() => verifyWalletDeployment(chainEvidence, { artifactBytecode: BYTECODE })).toThrow(
      WalletDeploymentMismatchError
    )
  })

  test("rejects a claimed address that doesn't match the receipt", () => {
    expect(() =>
      verifyWalletDeployment(evidence(), {
        artifactBytecode: BYTECODE,
        claimedContractAddress: "0x0000000000000000000000000000000000000bad",
      })
    ).toThrow(WalletDeploymentMismatchError)
  })
})

describe("remote import policy", () => {
  test.each([
    "https://unpkg.com/@openzeppelin/contracts/token/ERC20/ERC20.sol",
    "https://cdn.jsdelivr.net/npm/@openzeppelin/contracts/token/ERC20/ERC20.sol",
    "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/master/contracts/token/ERC20/ERC20.sol",
  ])("allows %s", (url) => {
    expect(assertAllowedImportUrl(url).hostname).toBeTruthy()
  })

  test.each([
    "http://unpkg.com/x.sol",
    "https://169.254.169.254/latest/meta-data",
    "https://localhost/x.sol",
    "https://unpkg.com.evil.example/x.sol",
    "https://unpkg.com:8443/x.sol",
    "https://user@unpkg.com/x.sol",
    "file:///etc/passwd",
    "not a url",
  ])("refuses %s", (url) => {
    expect(() => assertAllowedImportUrl(url)).toThrow(ImportNotAllowedError)
  })

  test("maps package and GitHub imports onto allowed hosts", () => {
    expect(getImportUrl("@openzeppelin/contracts/token/ERC20/ERC20.sol")).toBe(
      "https://unpkg.com/@openzeppelin/contracts/token/ERC20/ERC20.sol"
    )
    expect(
      getImportUrl("https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v5.0.0/contracts/access/Ownable.sol")
    ).toBe("https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.0.0/contracts/access/Ownable.sol")
    expect(getImportUrl("github.com/a/b/blob/main/C.sol")).toBe("https://raw.githubusercontent.com/a/b/main/C.sol")
    expect(getImportUrl("./IERC20.sol", "https://unpkg.com/@openzeppelin/contracts/token/ERC20/ERC20.sol")).toBe(
      "https://unpkg.com/@openzeppelin/contracts/token/ERC20/IERC20.sol"
    )
  })

  test("a disguised internal URL is still refused after mapping", () => {
    expect(() => assertAllowedImportUrl(getImportUrl("http://10.0.0.1/x.sol"))).toThrow(ImportNotAllowedError)
    expect(() => assertAllowedImportUrl(getImportUrl("internal-service/x.sol"))).toThrow(ImportNotAllowedError)
  })
})
