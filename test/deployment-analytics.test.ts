import { describe, expect, test } from "bun:test"
import { buildPublicAnalytics, deduplicateDeployments, parseDeploymentChainFilter } from "@/lib/deployment-analytics"
import type { DeploymentRecordBase } from "@/lib/types"

const deployments: DeploymentRecordBase[] = [
  {
    chainId: 137,
    cid: "polygon-mainnet-cid",
    contractAddress: "0x1370",
    deployHash: "0x1371",
  },
  {
    chainId: 137,
    cid: "polygon-mainnet-cid",
    contractAddress: "0x1370",
    deployHash: "0x1371",
  },
  {
    chainId: 80_002,
    cid: "polygon-amoy-cid",
    contractAddress: "0x800020",
    deployHash: "0x800021",
  },
  {
    chainId: 44_787,
    cid: "celo-alfajores-cid",
    contractAddress: "0x447870",
    deployHash: "0x447871",
  },
  {
    chainId: 31,
    cid: "legacy-chain-cid",
    contractAddress: "0x310",
    deployHash: "0x311",
  },
]

describe("deployment analytics", () => {
  test("uses the dashboard identity to deduplicate records", () => {
    expect(deduplicateDeployments(deployments)).toHaveLength(4)
  })

  test("reports Polygon mainnet first, names retired chains, and keeps legacy chains in the total", () => {
    const analytics = buildPublicAnalytics({
      customAgentsCreated: 77,
      deployments,
      observedAt: "2026-08-24T15:17:00.584Z",
    })

    expect(analytics.customAgentsCreated).toBe(77)
    expect(analytics.recordedDeployments.total).toBe(4)
    expect(analytics.recordedDeployments.byChain).toEqual([
      {
        chainId: 137,
        chainName: "Polygon",
        network: "mainnet",
        recordedDeployments: 1,
      },
      {
        chainId: 80_002,
        chainName: "Polygon Amoy",
        network: "testnet",
        recordedDeployments: 1,
      },
      {
        chainId: 44_787,
        chainName: "Celo Alfajores (retired)",
        network: "testnet",
        recordedDeployments: 1,
      },
      {
        chainId: 31,
        chainName: "Chain 31",
        network: "unknown",
        recordedDeployments: 1,
      },
    ])
  })
})

describe("deployment chain filters", () => {
  test("accepts shareable Polygon aliases and chain IDs", () => {
    expect(parseDeploymentChainFilter("polygon")).toBe(137)
    expect(parseDeploymentChainFilter("polygon-mainnet")).toBe(137)
    expect(parseDeploymentChainFilter("137")).toBe(137)
    expect(parseDeploymentChainFilter("amoy")).toBe(80_002)
    expect(parseDeploymentChainFilter("polygon-amoy")).toBe(80_002)
    expect(parseDeploymentChainFilter("80002")).toBe(80_002)
  })

  test("rejects unsupported filters", () => {
    expect(parseDeploymentChainFilter(undefined)).toBeNull()
    expect(parseDeploymentChainFilter("ethereum")).toBeNull()
  })
})
