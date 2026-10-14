import { AGENT_DEPLOY_CHAINS, RETIRED_CHAINS } from "@/lib/constants"
import type { DeploymentRecordBase } from "@/lib/types"

type PublicDeploymentChainStats = {
  chainId: number
  chainName: string
  network: "mainnet" | "testnet" | "unknown"
  recordedDeployments: number
}

type PublicAnalytics = {
  customAgentsCreated: number
  definitions: {
    customAgentsCreated: string
    recordedDeployments: string
  }
  observedAt: string
  recordedDeployments: {
    byChain: PublicDeploymentChainStats[]
    total: number
  }
}

const CHAIN_FILTER_ALIASES: Record<string, number> = {
  "137": 137,
  "80002": 80_002,
  amoy: 80_002,
  polygon: 137,
  "polygon-amoy": 80_002,
  "polygon-mainnet": 137,
}

const deploymentIdentity = (deployment: DeploymentRecordBase): string =>
  `${deployment.chainId}-${deployment.deployHash}-${deployment.cid}`

export const deduplicateDeployments = <T extends DeploymentRecordBase>(deployments: T[]): T[] => {
  const seen = new Set<string>()

  return deployments.filter((deployment) => {
    const identity = deploymentIdentity(deployment)
    if (seen.has(identity)) {
      return false
    }

    seen.add(identity)
    return true
  })
}

export const parseDeploymentChainFilter = (value: string | string[] | undefined): number | null => {
  const normalizedValue = Array.isArray(value) ? value[0] : value
  if (!normalizedValue) {
    return null
  }

  return CHAIN_FILTER_ALIASES[normalizedValue.toLowerCase()] ?? null
}

export const buildPublicAnalytics = ({
  customAgentsCreated,
  deployments,
  observedAt,
}: {
  customAgentsCreated: number
  deployments: DeploymentRecordBase[]
  observedAt: string
}): PublicAnalytics => {
  const uniqueDeployments = deduplicateDeployments(deployments)
  const countsByChain = new Map<number, number>()

  for (const deployment of uniqueDeployments) {
    countsByChain.set(deployment.chainId, (countsByChain.get(deployment.chainId) ?? 0) + 1)
  }

  // Retired chains still have records, so they are named, but they sort after
  // every chain that can still be deployed to.
  const knownChains = [...AGENT_DEPLOY_CHAINS, ...RETIRED_CHAINS]
  const knownChainsById = new Map(knownChains.map((chain) => [chain.id, chain]))
  const knownChainOrder = new Map(knownChains.map((chain, index) => [chain.id, index]))
  const chainIds = [...countsByChain.keys()].sort((first, second) => {
    const firstIndex = knownChainOrder.get(first)
    const secondIndex = knownChainOrder.get(second)

    if (firstIndex !== undefined && secondIndex !== undefined) {
      return firstIndex - secondIndex
    }
    if (firstIndex !== undefined) {
      return -1
    }
    if (secondIndex !== undefined) {
      return 1
    }

    return first - second
  })

  const byChain = chainIds.map((chainId): PublicDeploymentChainStats => {
    const chain = knownChainsById.get(chainId)
    let network: PublicDeploymentChainStats["network"] = "unknown"

    if (chain) {
      network = chain.testnet ? "testnet" : "mainnet"
    }

    return {
      chainId,
      chainName: chain?.name ?? `Chain ${chainId}`,
      network,
      recordedDeployments: countsByChain.get(chainId) ?? 0,
    }
  })

  return {
    customAgentsCreated,
    definitions: {
      customAgentsCreated:
        "Custom agent records indexed by agents:list with a corresponding agent record. Built-in agents are excluded.",
      recordedDeployments:
        "Unique persisted records by chainId, deployHash, and cid. New server-side deployments are persisted only after a successful transaction receipt; legacy records may predate that rule.",
    },
    observedAt,
    recordedDeployments: {
      byChain,
      total: uniqueDeployments.length,
    },
  }
}
