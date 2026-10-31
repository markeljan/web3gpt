import { type OpenAIResponsesProviderOptions, openai } from "@ai-sdk/openai"
import { convertToModelMessages, generateText, isStepCount, streamText, type UIMessage } from "ai"
import { AI_REASONING_EFFORT, getAiModel } from "@/lib/ai-model"
import { AGENT_DEPLOY_CHAINS, DEFAULT_AGENT, DEFAULT_COMPILER_VERSION, DEFAULT_TOOL_NAMES } from "@/lib/constants"
import { getAgentById } from "@/lib/data/agents"
import { getTools } from "@/lib/tools"

type AgentChatParams = {
  agentId: string
  messages: UIMessage[]
  userId?: string
  /** `user:<id>` or `ip:<addr>`; meters the server wallet's deployments. */
  callerId?: string
}

const providerOptions = {
  openai: {
    reasoningEffort: AI_REASONING_EFFORT,
    reasoningSummary: "concise",
  } satisfies OpenAIResponsesProviderOptions,
}

/**
 * How much history the model sees. Clients send the whole conversation every
 * turn, so without a window each request costs more than the last, with no
 * upper bound. Stored history is unaffected.
 */
export const MAX_MODEL_MESSAGES = 40

/**
 * The model's view of the conversation: the latest `MAX_MODEL_MESSAGES`
 * messages, without system messages. The system prompt is built on the server
 * from the agent, but history comes from the client, and the stored-chat types
 * still admit legacy `system` messages. AI SDK 7 rejects a system message in
 * `messages` (the whole turn fails), and letting one through would let a client
 * rewrite the agent's instructions.
 */
export const toModelWindow = (messages: UIMessage[]): UIMessage[] => {
  const conversation = messages.filter((message) => message.role !== "system")
  return conversation.length > MAX_MODEL_MESSAGES ? conversation.slice(-MAX_MODEL_MESSAGES) : conversation
}

const availableChainsText = AGENT_DEPLOY_CHAINS.map((chain) => `${chain.name} (chainId: ${chain.id})`).join(", ")

export const buildAgentSystemPrompt = (instructions: string): string => `${instructions || DEFAULT_AGENT.instructions}

Current Settings:
- Compiler Version: ${DEFAULT_COMPILER_VERSION}
- Available Chains: ${availableChainsText}`

const getAgentRuntime = async ({ agentId, userId, callerId }: Omit<AgentChatParams, "messages">) => {
  const agent = await getAgentById(agentId)
  // KV-stored agents are untyped at runtime and older records lack toolNames.
  // biome-ignore lint/suspicious/noUnnecessaryConditions: runtime data can be missing the field
  const tools = getTools(agent.toolNames ?? DEFAULT_TOOL_NAMES, { callerId, userId })

  return {
    agent,
    systemPrompt: buildAgentSystemPrompt(agent.instructions || DEFAULT_AGENT.instructions),
    tools,
  }
}

export const generateAgentReply = async ({ agentId, messages, userId, callerId }: AgentChatParams) => {
  const { agent, tools, systemPrompt } = await getAgentRuntime({ agentId, callerId, userId })

  const result = await generateText({
    instructions: systemPrompt,
    messages: await convertToModelMessages(toModelWindow(messages)),
    model: openai(getAiModel()),
    providerOptions,
    stopWhen: isStepCount(5),
    tools,
  })

  return { agent, result, tools }
}

export const streamAgentReply = async ({ agentId, messages, userId, callerId }: AgentChatParams) => {
  const { agent, tools, systemPrompt } = await getAgentRuntime({ agentId, callerId, userId })

  const result = streamText({
    instructions: systemPrompt,
    messages: await convertToModelMessages(toModelWindow(messages)),
    model: openai(getAiModel()),
    providerOptions,
    stopWhen: isStepCount(5),
    tools,
  })

  return { agent, result, tools }
}
