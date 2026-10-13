import type { UIMessage } from "ai"
import type { SolcInputSources } from "solc"
import type { Abi, Chain, Hash } from "viem"

export type NextPageProps = {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>
}

// Support both v4 (content) and v5 (parts) message formats for backward compatibility
export type LegacyMessage = {
  id: string
  role: "user" | "assistant" | "system"
  content?: string
  parts?: UIMessage["parts"]
}

export type DbChat = {
  id: string
  agentId: string
  title: string
  /** Set once, on the first write. Preserved by `storeChat` on every later turn. */
  createdAt: number
  /** Last write. Absent on chats stored before this field existed. */
  updatedAt?: number
  userId: string
  messages: (UIMessage | LegacyMessage)[]
  published: boolean
  avatarUrl?: string | null
}

export type DbChatListItem = {
  id: string
  agentId: string
  createdAt: number
  title: string
  userId: string
  published: boolean
}

export type SkillChat = {
  id: string
  agentId: string
  createdAt: number
  title: string
  messages: UIMessage[]
}

export type SkillChatHistoryItem = {
  id: string
  role: "user" | "assistant" | "system"
  text: string
}

export type ToolName = "resolveAddress" | "resolveDomain" | "deployContract" | "createAgent"

export type Agent = {
  id: string
  userId: string
  name: string
  description: string
  instructions: string
  imageUrl: string
  creator: string
  toolNames: ToolName[]
}

export type CreateAgentParams = Omit<Agent, "id">

export type DeployContractParams = {
  chainId: number
  contractName: string
  sourceCode: string
  constructorArgs: Array<string | string[]>
  imports?: Record<string, string>
}

export type DeployContractResult = {
  chainId: number
  contractAddress: Hash
  sourceCode: string
  explorerUrl: string
  ipfsUrl: string
  transactionExplorerUrl: string
  transactionHash: Hash
  verifyContractConfig: VerifyContractParams
  abi: Abi
  standardJsonInput: string
}

export type VerifyContractParams = {
  deployHash: Hash
  contractAddress: Hash
  standardJsonInput: string
  encodedConstructorArgs: string
  fileName: string
  contractName: string
  /**
   * Full solc version the contract was compiled with, e.g. "v0.8.24+commit.e11b9ed9".
   * Records queued before compiler selection existed don't have it; they were
   * all compiled with DEFAULT_COMPILER_VERSION.
   */
  compilerVersion?: string
  viemChain: Omit<Chain, "contracts" | "ensRegistry" | "ensUniversalResolver" | "multicall3" | "formatters">
  verificationAttempts?: number
  verificationGuid?: string
  verificationStatus?: "queued" | "submitted" | "verified" | "error" | "failed"
  queuedAt?: number
  submittedAt?: number
  lastCheckedAt?: number
  verifiedAt?: number
  failedAt?: number
  lastVerificationError?: string
}

export type WalletDeployArtifact = {
  abi: Abi
  bytecode: Hash
  /** Missing on artifacts prepared before compiler selection existed. */
  compilerVersion?: string
  contractName: string
  sources: SolcInputSources
  standardJsonInput: string
}

export type LastDeploymentData = DeployContractResult & {
  walletAddress: Hash
  chainId: number
  transactionHash: Hash
}

export type DeploymentRecordBase = {
  cid: string
  chainId: number
  contractAddress: Hash
  deployHash: Hash
}

export type DeploymentRecord = DeploymentRecordBase & {
  contractName: string
  deployerAddress: Hash
}

export type ChainWithIcon = Chain & { iconUrl: string; iconBackground: string }

export type ChainDetails = {
  rpcUrl: string
  explorerUrl: string
  explorerApiUrl: string
  explorerApiKey: string
  explorerType: "blockscout" | "etherscan" | "unknown"
}
