import { generateId, tool } from "ai"
import { z } from "zod"
import { resolveAddress, resolveDomain } from "@/lib/actions/unstoppable-domains"
import { PRODUCTION_URL } from "@/lib/config"
import { checkDeployAllowance } from "@/lib/deploy-limits"
import { deployContract } from "@/lib/solidity/deploy"
import { formatDeploymentToolResult } from "@/lib/solidity/deployment-tool-result"
import type { ToolName } from "@/lib/types"

// Re-export type for convenience
export type { ToolName } from "@/lib/types"

// Tool names constant array
export const TOOL_NAMES = ["resolveAddress", "resolveDomain", "deployContract", "createAgent"] as const

// Default tools for most agents (createAgent excluded - only for Creator agent)
export const DEFAULT_TOOL_NAMES: ToolName[] = ["resolveAddress", "resolveDomain", "deployContract"]

// Zod schemas (exported for reuse/testing)
export const schemas = {
  createAgent: z.object({
    creator: z.string().describe("The name of the agent creator"),
    description: z
      .string()
      .describe("The description of what the agent does. (short and used for informational purposes)"),
    imageUrl: z
      .string()
      .optional()
      .describe(
        "A url used as the display image for the agent. If not provided, a default image will be used. When given a link, display the link to the user using markdown to confirm that it works before finalizing the agent creation. (NOT <img> tag)"
      ),
    instructions: z
      .string()
      .describe(
        "The instructions for the agent that determines how it interacts with users. This is the most important part of the agent. It should be clear and concise. Use markdown for formatting. If the user doesn't provide in depth instructions, use your judgement to either ask for more information or expand on the instructions to make the agent more useful. Remind the user about the agent's available tools and capabilities if they go out of scope with their requested instructions."
      ),
    name: z.string().describe("The name of the agent."),
    toolNames: z
      .array(z.enum(TOOL_NAMES))
      .default(["resolveAddress", "resolveDomain", "deployContract"])
      .describe("The names of the tools that the agent will have available."),
  }),

  deployContract: z.object({
    chainId: z
      .number()
      .describe("The chainId to deploy to. A list of available chains will be made available to you at runtime."),
    constructorArgs: z
      .array(z.union([z.string(), z.array(z.string())]))
      .default([])
      .describe(
        "Array of arguments for the contract's constructor. Each argument should be a string representation of the value. Pass an empty array [] if the constructor has no arguments."
      ),
    contractName: z.string().describe("The name of the contract to deploy"),
    sourceCode: z
      .string()
      .describe(
        'Source code of the smart contract. Format as a single-line string, with all line breaks and quotes escaped to be valid stringified JSON. Do not use any local imports or dependencies. Example import: import "@openzeppelin/contracts/token/ERC20/ERC20.sol" By default use SPDX License Identifier MIT and the latest available fixed Solidity version (0.8.29).'
      ),
  }),
  resolveAddress: z.object({
    address: z
      .string()
      .describe("The cryptocurrency address to resolve (e.g., '0x42e9c498135431a48796B5fFe2CBC3d7A1811927')"),
  }),

  resolveDomain: z.object({
    domain: z.string().describe("The domain to resolve (e.g., 'soko.eth')"),
    ticker: z.string().optional().default("ETH").describe("The cryptocurrency ticker (default: 'ETH')"),
  }),
}

// Context required for tools that need runtime data
export type ToolContext = {
  userId?: string
  /** Who is driving the conversation, for deployment limits: `user:<id>` or `ip:<addr>`. */
  callerId?: string
}

// Tool definitions factory - creates tool with execute function
const createToolDefinitions = (context: ToolContext = {}) => ({
  createAgent: tool({
    description: `Create and publish an AI agent (assistant) to the Web3GPT Agents repository. Agents are generally for Solidity smart contract development but can also be created for anything else. All agents have these tools available: ${DEFAULT_TOOL_NAMES.join(", ")}`,
    execute: async ({ name, description, instructions, creator, imageUrl, toolNames }) => {
      const { userId } = context

      if (!userId) {
        return JSON.stringify({ error: "Unauthorized, user not signed in." })
      }

      // Generate a unique agent ID
      const agentId = `agent_${generateId()}`

      // Store the agent in KV
      const { storeAgentDirect } = await import("@/lib/data/kv")
      await storeAgentDirect({
        creator,
        description,
        id: agentId,
        imageUrl: imageUrl || "/assets/agent-factory.png",
        instructions,
        name,
        toolNames: (toolNames as ToolName[]) || DEFAULT_TOOL_NAMES,
        userId,
      })

      const agentChatUrl = `${PRODUCTION_URL}/?a=${agentId}`
      return `Agent created successfully! Agent chat URL: ${agentChatUrl}`
    },
    inputSchema: schemas.createAgent,
  }),

  deployContract: tool({
    description:
      "Deploy a smart contract to an EVM compatible chain. Returns the tx hash of the deployment and an IPFS url to a directory with the files used for the contract deployment.",
    execute: async ({ chainId, contractName, sourceCode, constructorArgs = [] }) => {
      // The server wallet pays for these deployments, so every call is metered.
      const allowance = await checkDeployAllowance({ callerId: context.callerId ?? "ip:unknown", chainId })
      if (!allowance.ok) {
        return JSON.stringify({ error: allowance.reason })
      }

      const deployResult = await deployContract({
        chainId,
        constructorArgs,
        contractName,
        sourceCode,
      })
      return formatDeploymentToolResult(deployResult)
    },
    inputSchema: schemas.deployContract,
  }),
  resolveAddress: tool({
    description: "Resolve a cryptocurrency address to a domain. Returns the resolved domain for a given address.",
    execute: async ({ address }) => {
      const domain = await resolveAddress(address)
      return `Resolved domain for address ${address}: ${domain}`
    },
    inputSchema: schemas.resolveAddress,
  }),

  resolveDomain: tool({
    description: "Resolve a domain to a cryptocurrency address. Returns the resolved address for a given domain.",
    execute: async ({ domain, ticker = "ETH" }) => {
      const address = await resolveDomain(domain, ticker)
      return `Resolved address for domain ${domain}: ${address}`
    },
    inputSchema: schemas.resolveDomain,
  }),
})

/**
 * Get a single tool by name
 */
export const getTool = (toolName: ToolName, context: ToolContext = {}) => createToolDefinitions(context)[toolName]

/**
 * Get multiple tools by names - returns object keyed by tool name
 * This is the primary function for creating toolsets for agents
 */
export const getTools = <T extends ToolName>(toolNames: T[], context: ToolContext = {}) => {
  const allTools = createToolDefinitions(context)
  return Object.fromEntries(toolNames.map((name) => [name, allTools[name]])) as Pick<
    ReturnType<typeof createToolDefinitions>,
    T
  >
}

/**
 * Get all available tools
 */
export const getAllTools = (context: ToolContext = {}) => createToolDefinitions(context)

// Legacy exports for backward compatibility
export const createTools = getTools
export const createAllTools = getAllTools

// Type for the tools object
export type Tools = ReturnType<typeof getTools>
