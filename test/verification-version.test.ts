import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { mainnet } from "viem/chains"

let explorerType = "etherscan"
mock.module("server-only", () => ({}))
mock.module("@/lib/config", () => ({
  getChainDetails: () => ({ explorerApiKey: "test", explorerApiUrl: "https://example.com/api", explorerType }),
}))
const { verifyContract } = await import("@/lib/solidity/verification")
afterEach(() => mock.restore())

test.each(["etherscan", "blockscout"])("%s submits bundled, stored and legacy compiler versions", async (explorer) => {
  explorerType = explorer
  const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(() => Promise.resolve(Response.json({ result: "guid", status: "1" })), {
      preconnect: fetch.preconnect,
    })
  )
  for (const [compilerVersion, expected] of [
    ["v0.8.38+commit.1835d247", "v0.8.38+commit.1835d247"],
    ["v0.8.37+commit.f401782d", "v0.8.37+commit.f401782d"],
    [undefined, "v0.8.29+commit.ab55807c"],
  ]) {
    // biome-ignore lint/performance/noAwaitInLoops: Inspect each captured request before submitting the next.
    await verifyContract({
      compilerVersion,
      contractAddress: "0x0000000000000000000000000000000000000001",
      contractName: "C",
      deployHash: "0x01",
      encodedConstructorArgs: "",
      fileName: "C.sol",
      standardJsonInput: "{}",
      viemChain: mainnet,
    })
    const params = new URLSearchParams(String(fetchSpy.mock.calls.at(-1)?.[1]?.body))
    expect(params.get("compilerversion")).toBe(expected ?? null)
    expect(params.get("chainid")).toBe(explorer === "etherscan" ? "1" : null)
  }
})
