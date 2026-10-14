import { describe, expect, test } from "bun:test"
import { celoAlfajores, celoSepolia } from "viem/chains"
import { BLOCKSCOUT_URLS } from "@/lib/blockscout"
import { getChainById, getChainDetails, getDisplayChainById } from "@/lib/config"
import { AGENT_DEPLOY_CHAINS, RETIRED_CHAINS, RPC_URLS, SUPPORTED_CHAINS } from "@/lib/constants"
import { ETHERSCAN_V2_URLS } from "@/lib/etherscan"
import { getExplorerUrl } from "@/lib/utils"

const ADDRESS = "0x000000000000000000000000000000000000ce10"

describe("Celo Sepolia chain support", () => {
  test("offers Celo Sepolia for agent and wallet deployments", () => {
    expect(celoSepolia.id).toBe(11_142_220)
    expect(AGENT_DEPLOY_CHAINS.some((chain) => chain.id === celoSepolia.id)).toBeTrue()
    expect(SUPPORTED_CHAINS.some((chain) => chain.id === celoSepolia.id)).toBeTrue()
    expect(getChainById(celoSepolia.id)?.name).toBe("Celo Sepolia")
  })

  test("routes Celo Sepolia through Alchemy and verifies on Blockscout", () => {
    expect(RPC_URLS[celoSepolia.id]).toStartWith("https://celo-sepolia.g.alchemy.com/v2/")
    expect(BLOCKSCOUT_URLS[celoSepolia.id]).toBe("https://celo-sepolia.blockscout.com")
    expect(ETHERSCAN_V2_URLS[celoSepolia.id]?.explorerUrl).toBe("https://sepolia.celoscan.io/")

    const chain = getChainById(celoSepolia.id)
    expect(chain).not.toBeNull()
    if (!chain) {
      return
    }
    expect(getChainDetails(chain)).toMatchObject({
      explorerApiUrl: "https://celo-sepolia.blockscout.com/api",
      explorerType: "blockscout",
      explorerUrl: "https://celo-sepolia.blockscout.com",
    })
    expect(getExplorerUrl({ hash: ADDRESS, type: "address", viemChain: chain })).toBe(
      `https://celo-sepolia.blockscout.com/address/${ADDRESS}`
    )
  })
})

describe("retired Celo Alfajores", () => {
  test("is no longer a deploy target", () => {
    expect(AGENT_DEPLOY_CHAINS.some((chain) => chain.id === celoAlfajores.id)).toBeFalse()
    expect(SUPPORTED_CHAINS.some((chain) => chain.id === celoAlfajores.id)).toBeFalse()
    expect(getChainById(celoAlfajores.id)).toBeNull()
    expect(RPC_URLS[celoAlfajores.id]).toBeUndefined()
  })

  test("still names historical deployments, without a dead explorer link", () => {
    expect(RETIRED_CHAINS.map((retired) => retired.id)).toEqual([celoAlfajores.id])

    const chain = getDisplayChainById(celoAlfajores.id)
    expect(chain?.name).toBe("Celo Alfajores (retired)")
    expect(chain?.iconUrl).toBe("/assets/chains/celo-logo.png")
    if (!chain) {
      return
    }

    // Both Alfajores explorers now redirect to Celo Sepolia, so a link would land on the wrong chain.
    expect(BLOCKSCOUT_URLS[celoAlfajores.id]).toBeUndefined()
    expect(ETHERSCAN_V2_URLS[celoAlfajores.id]).toBeUndefined()
    expect(getExplorerUrl({ hash: ADDRESS, type: "address", viemChain: chain })).toBe("")
    expect(getExplorerUrl({ hash: ADDRESS, type: "tx", viemChain: chain })).toBe("")
  })

  test("display lookup prefers active chains and returns null for unknown ones", () => {
    expect(getDisplayChainById(celoSepolia.id)?.name).toBe("Celo Sepolia")
    expect(getDisplayChainById(31)).toBeNull()
  })
})
