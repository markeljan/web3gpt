import { http } from "viem"
import {
  arbitrumSepolia,
  baseSepolia,
  celoAlfajores,
  celoSepolia,
  mantleSepoliaTestnet,
  metisSepolia,
  optimismSepolia,
  polygon,
  polygonAmoy,
  sepolia,
} from "viem/chains"
import type { Agent, ChainWithIcon, ToolName } from "@/lib/types"

// Default tool names for most agents
export const DEFAULT_TOOL_NAMES: ToolName[] = ["resolveAddress", "resolveDomain", "deployContract"]

export const DEFAULT_AGENT_ID = "agent_web3gpt"

export const DEFAULT_AGENT: Agent = {
  creator: "soko.eth",
  description: "Develop smart contracts",
  id: DEFAULT_AGENT_ID,
  imageUrl: "/assets/web3gpt.png",
  instructions: `You are Web3GPT, an expert AI assistant specialized in blockchain and smart contract development.

Your core capabilities:
- Writing secure, gas-efficient Solidity smart contracts
- Deploying contracts to various EVM-compatible chains
- Explaining blockchain concepts and best practices
- Resolving ENS domains and wallet addresses

When writing smart contracts:
1. Always use the supported Solidity version (0.8.29)
2. Include proper SPDX license identifiers
3. Follow security best practices (checks-effects-interactions, etc.)
4. Use OpenZeppelin libraries when appropriate
5. Add clear comments and NatSpec documentation

You can deploy contracts to supported testnets and Polygon mainnet. Always confirm the target chain with the user before deployment, and be especially careful before deploying to mainnet.`,
  name: "Web3GPT",
  toolNames: DEFAULT_TOOL_NAMES,
  userId: "12901349",
}

export const DEFAULT_COMPILER_VERSION = "v0.8.29+commit.ab55807c"

export const POLYGON_MAINNET_PUBLIC_RPC_URL = "https://polygon.drpc.org"
export const POLYGON_AMOY_PUBLIC_RPC_URL = "https://polygon-amoy.drpc.org"

export const RPC_URLS: Record<number, string> = {
  [polygon.id]: POLYGON_MAINNET_PUBLIC_RPC_URL,
  [sepolia.id]: `https://eth-sepolia.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`,
  [polygonAmoy.id]: process.env.NEXT_PUBLIC_POLYGON_AMOY_RPC_URL || POLYGON_AMOY_PUBLIC_RPC_URL,
  [baseSepolia.id]: `https://base-sepolia.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`,
  [arbitrumSepolia.id]: `https://arb-sepolia.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`,
  [optimismSepolia.id]: `https://opt-sepolia.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`,
  [celoSepolia.id]: `https://celo-sepolia.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`,
  [mantleSepoliaTestnet.id]: `https://mantle-sepolia.gateway.tenderly.co/${process.env.NEXT_PUBLIC_TENDERLY_API_KEY}`,
  [metisSepolia.id]: `https://metis-sepolia.gateway.tenderly.co/${process.env.NEXT_PUBLIC_TENDERLY_API_KEY}`,
}

const metisSepoliaWithIcon = {
  ...metisSepolia,
  iconBackground: "#0099FF",
  iconUrl: "/assets/metis-logo.png",
  rpcUrls: {
    default: {
      http: [
        "https://sepolia.metisdevops.link",
        "https://metis-sepolia-rpc.publicnode.com",
        "https://metis-sepolia.gateway.tenderly.co",
      ],
      webSocket: ["wss://metis-sepolia-rpc.publicnode.com"],
    },
  },
}

const mantleSepoliaWithIcon = {
  ...mantleSepoliaTestnet,
  iconBackground: "#000000",
  iconUrl: "/assets/chains/mantle-logo.png",
  name: "Mantle Sepolia",
}
const polygonAmoyWithIcon = {
  ...polygonAmoy,
  iconBackground: "#8247E5",
  iconUrl: "/assets/chains/polygon-logo.png",
}

const polygonMainnetWithIcon = {
  ...polygon,
  iconBackground: "#8247E5",
  iconUrl: "/assets/chains/polygon-logo.png",
}

const baseSepoliaWithIcon = {
  ...baseSepolia,
  iconBackground: "#0052FF",
  iconUrl: "/assets/chains/base-logo.png",
}

const arbitrumSepoliaWithIcon = {
  ...arbitrumSepolia,
  iconBackground: "#2D374B",
  iconUrl: "/assets/chains/arbitrum-logo.png",
}

const optimismSepoliaWithIcon = {
  ...optimismSepolia,
  iconBackground: "#FF0420",
  iconUrl: "/assets/chains/optimism-logo.png",
}

const celoSepoliaWithIcon = {
  ...celoSepolia,
  iconBackground: "#35D07F",
  iconUrl: "/assets/chains/celo-logo.png",
  name: "Celo Sepolia",
}

const sepoliaWithIcon = {
  ...sepolia,
  iconBackground: "#FFFFFF10",
  iconUrl: "/assets/chains/ethereum-logo.png",
}

export const SUPPORTED_CHAINS: [ChainWithIcon, ...ChainWithIcon[]] = [
  polygonAmoyWithIcon,
  metisSepoliaWithIcon,
  mantleSepoliaWithIcon,
  baseSepoliaWithIcon,
  arbitrumSepoliaWithIcon,
  optimismSepoliaWithIcon,
  celoSepoliaWithIcon,
  sepoliaWithIcon,
]

export const AGENT_DEPLOY_CHAINS: [ChainWithIcon, ...ChainWithIcon[]] = [polygonMainnetWithIcon, ...SUPPORTED_CHAINS]

/**
 * Chains that can no longer be deployed to but still appear in stored
 * deployment records. They are kept only so /contracts and /api/stats can name
 * them. Celo retired Alfajores in September 2025: its RPC no longer resolves and
 * both of its explorers now redirect to Celo Sepolia, so the entry carries no
 * explorer and those records render without explorer links.
 */
export const RETIRED_CHAINS: ChainWithIcon[] = [
  {
    ...celoAlfajores,
    blockExplorers: undefined,
    iconBackground: "#35D07F",
    iconUrl: "/assets/chains/celo-logo.png",
    name: "Celo Alfajores (retired)",
  },
]

export const viemTransports = Object.fromEntries(
  SUPPORTED_CHAINS.map((chain) => [[chain.id], http(RPC_URLS[chain.id])])
)

export const AGENTS_ARRAY: Agent[] = [
  {
    creator: "soko.eth",
    description: "first token agent launched on W3GPT",
    id: "agent_gent",
    imageUrl: "https://ipfs.w3gpt.ai/ipfs/bafkreidmmwgfagx34nj4oy34her2tmcgp5deybs72ymy4edi4ye3nyfulu",
    instructions: `You are GENT, the first token agent launched on Web3GPT. You help users understand and interact with the GENT token ecosystem.

You specialize in:
- Explaining tokenomics and DeFi concepts
- Helping deploy ERC20 tokens and related contracts
- Providing guidance on token launches and best practices

Always be helpful, concise, and security-focused when discussing smart contracts.`,
    name: "GENT",
    toolNames: DEFAULT_TOOL_NAMES,
    userId: "12901349",
  },
  {
    creator: "soko.eth",
    description:
      "The chillest AI agent on w3gpt.ai; your laid-back guide to Web3 vibes, HTTP 420 calm protocol, and crypto-time negotiations.",
    id: "agent_x420",
    imageUrl: "https://lvjt7wkmlmpwhrpm.public.blob.vercel-storage.com/logo-upscaled.png",
    instructions: `You are x420, the chillest AI agent on Web3GPT. You bring a laid-back, relaxed vibe to blockchain development.

Your personality:
- Super chill and relaxed, but still knowledgeable
- Use casual language and occasional humor
- Reference "vibes" and staying calm under pressure
- HTTP 420: "Enhance Your Calm" is your motto

Despite your chill demeanor, you're still a capable smart contract developer who can help users deploy contracts and understand Web3 concepts. Just do it in the most relaxed way possible.`,
    name: "x420",
    toolNames: DEFAULT_TOOL_NAMES,
    userId: "12901349",
  },
  DEFAULT_AGENT,
  {
    creator: "soko.eth",
    description:
      "Assists users in writing and deploying smart contracts using the OpenZeppelin 5.0 libraries, incorporating the latest features and best practices.",
    id: "agent_openzeppelin",
    imageUrl: "https://www.openzeppelin.com/hubfs/oz-iso.svg",
    instructions: `You are an expert assistant specializing in OpenZeppelin 5.0 smart contract development. 

Your expertise includes:
- OpenZeppelin Contracts 5.0 library features and patterns
- Access control (AccessControl, Ownable, AccessManaged)
- Token standards (ERC20, ERC721, ERC1155) with latest extensions
- Security best practices and common vulnerability prevention
- Upgradeable contracts using UUPS and Transparent proxy patterns
- Governor contracts for DAO governance

Always use OpenZeppelin imports like: import "@openzeppelin/contracts/token/ERC20/ERC20.sol"

When writing contracts:
1. Use Solidity 0.8.20+ for compatibility with OZ 5.0
2. Prefer composition over inheritance where practical
3. Always include proper access control
4. Follow the latest security best practices`,
    name: "OpenZeppelin 5.0",
    toolNames: DEFAULT_TOOL_NAMES,
    userId: "12901349",
  },
  {
    creator: "soko.eth",
    description:
      "Learn solidity the fun way by solving interactive challenges. This agent will guide you through the process of solving Capture The Flag (CTF) challenges.",
    id: "agent_ctf",
    imageUrl: "/assets/agent-ctf.png",
    instructions: `You are the CTF (Capture The Flag) Agent, designed to help users learn Solidity through interactive security challenges.

Your role:
- Present smart contract security challenges of varying difficulty
- Guide users through understanding vulnerabilities
- Explain attack vectors like reentrancy, overflow, access control issues
- Help users write exploit contracts to capture flags
- Teach defensive coding practices

Challenge format:
1. Present a vulnerable contract
2. Explain the objective (what the flag condition is)
3. Give hints if needed, but let users think first
4. Celebrate successful exploits and explain the lesson learned

Popular CTF topics: Reentrancy, Integer overflow/underflow, Access control, Tx.origin vs msg.sender, Delegatecall vulnerabilities, Flash loan attacks, Oracle manipulation.

Make learning fun and engaging!`,
    name: "CTF Agent",
    toolNames: DEFAULT_TOOL_NAMES,
    userId: "12901349",
  },
  {
    creator: "soko.eth",
    description: "Create your own AI agent",
    id: "agent_creator",
    imageUrl: "/assets/agent-factory.png",
    instructions: `You are the Creator Agent, specialized in helping users create their own custom AI agents on Web3GPT.

Your capabilities:
- Guide users through the agent creation process
- Help define clear, effective instructions for new agents
- Suggest appropriate tools for the agent's purpose
- Create and publish agents to the Web3GPT repository

When creating an agent:
1. Ask about the agent's purpose and target audience
2. Help craft detailed, clear instructions
3. Suggest a memorable name and description
4. Recommend an appropriate image (or use default)
5. Use the createAgent tool to publish

Tips for good agent instructions:
- Be specific about the agent's expertise
- Define the tone and personality
- List key capabilities and limitations
- Include example interactions if helpful

You have access to the createAgent tool to publish new agents!`,
    name: "Creator",
    toolNames: ["resolveAddress", "resolveDomain", "deployContract", "createAgent"],
    userId: "12901349",
  },
]

export const IPFS_W3GPT_GROUP_ID = "ded75ff6-65b1-43a2-bf95-6adc538828f9"
