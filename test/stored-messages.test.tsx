import { beforeEach, describe, expect, mock, test } from "bun:test"
import { simulateReadableStream, type UIMessage, validateUIMessages } from "ai"
import { MockLanguageModelV4 } from "ai/test"
import { renderToStaticMarkup } from "react-dom/server"
import type { LegacyMessage } from "@/lib/types"

// Chats in KV were written by AI SDK 6 (and some by AI SDK 4, as `content`
// strings). AI SDK 7 must load them, render them, and send them back to the
// model as the history of the next turn.

const DEPLOY_OUTPUT =
  "Contract deployed on chain ID 80002. Contract address: 0xC0FFEE. Transaction hash: 0xabc. IPFS: https://ipfs.example/ipfs/cid"

/** An assistant turn exactly as AI SDK 6's `toUIMessageStream` persisted it. */
const v6Assistant: UIMessage = {
  id: "a1",
  parts: [
    { type: "step-start" },
    {
      providerMetadata: { openai: { itemId: "rs_1", reasoningEncryptedContent: null } },
      state: "done",
      text: "**Planning the deployment**\n\nThe user wants an ERC20 on Amoy.",
      type: "reasoning",
    },
    {
      callProviderMetadata: { openai: { itemId: "fc_1" } },
      input: { chainId: 80_002, constructorArgs: [], contractName: "Token", sourceCode: "contract Token {}" },
      output: DEPLOY_OUTPUT,
      state: "output-available",
      toolCallId: "call_1",
      type: "tool-deployContract",
    },
    {
      errorText: "Domain not found",
      input: { domain: "nobody.eth", ticker: "ETH" },
      state: "output-error",
      toolCallId: "call_2",
      type: "tool-resolveDomain",
    },
    { type: "step-start" },
    {
      providerMetadata: { openai: { itemId: "msg_1" } },
      state: "done",
      text: "Deployed your token at 0xC0FFEE.",
      type: "text",
    },
  ],
  role: "assistant",
}

const storedChat: (UIMessage | LegacyMessage)[] = [
  { content: "You are a helpful assistant.", id: "s0", role: "system" },
  { content: "An AI SDK 4 era question", id: "l1", role: "user" },
  { content: "An AI SDK 4 era answer", id: "l2", role: "assistant" },
  { id: "u1", parts: [{ text: "Deploy a token on Amoy", type: "text" }], role: "user" },
  v6Assistant,
]

const usage = {
  inputTokens: { cacheRead: 0, cacheWrite: 0, noCache: 1, total: 1 },
  outputTokens: { reasoning: 0, text: 1, total: 1 },
}

const textModel = () =>
  new MockLanguageModelV4({
    doStream: () =>
      Promise.resolve({
        stream: simulateReadableStream({
          chunks: [
            { id: "t1", type: "text-start" as const },
            { delta: "Anything else?", id: "t1", type: "text-delta" as const },
            { id: "t1", type: "text-end" as const },
            { finishReason: { raw: "stop", unified: "stop" as const }, type: "finish" as const, usage },
          ],
        }),
      }),
  })

let model = textModel()
const stored: UIMessage[][] = []

mock.module("server-only", () => ({}))
mock.module("@/lib/redis", () => ({ redis: { expire: () => Promise.resolve(1), incr: () => Promise.resolve(1) } }))
mock.module("@ai-sdk/openai", () => ({ openai: () => model }))
mock.module("@/lib/auth", () => ({ getSession: () => Promise.resolve({ user: { id: "1001", image: null } }) }))
mock.module("@/lib/data/agents", () => ({
  getAgentById: () =>
    Promise.resolve({
      id: "agent_web3gpt",
      instructions: "server instructions",
      name: "Web3GPT",
      toolNames: ["deployContract", "resolveDomain"],
    }),
}))
mock.module("@/lib/data/kv", () => ({
  getChatOwnerId: () => Promise.resolve("1001"),
  storeAgentDirect: () => Promise.resolve(),
  storeChat: ({ data }: { data: { messages: UIMessage[] } }) => {
    stored.push(data.messages)
    return Promise.resolve(true)
  },
}))
mock.module("@/lib/deploy-limits", () => ({
  checkDeployAllowance: () => Promise.resolve({ ok: true }),
  getCallerId: () => "user:1001",
}))
mock.module("@/lib/solidity/deploy", () => ({ deployContract: () => Promise.reject(new Error("not called")) }))
mock.module("@/lib/actions/unstoppable-domains", () => ({
  resolveAddress: () => Promise.resolve(""),
  resolveDomain: () => Promise.resolve(""),
}))

const { POST } = await import("@/app/api/chat/route")
const { toUIMessages } = await import("@/lib/chat-utils")
const { getAllTools } = await import("@/lib/tools")
const { ChatList } = await import("@/components/chat/chat-list")
const { TooltipProvider } = await import("@/components/ui/tooltip")

const render = (messages: (UIMessage | LegacyMessage)[]) =>
  renderToStaticMarkup(
    <TooltipProvider>
      <ChatList messages={messages} />
    </TooltipProvider>
  )

beforeEach(() => {
  model = textModel()
  stored.length = 0
})

describe("stored AI SDK 6 chats under AI SDK 7", () => {
  test("load unchanged through the chat page conversion", () => {
    const messages = toUIMessages(storedChat)
    expect(messages.at(-1)).toBe(v6Assistant)
    expect(messages[1]).toEqual({ id: "l1", parts: [{ text: "An AI SDK 4 era question", type: "text" }], role: "user" })
  })

  test("pass AI SDK 7's own UIMessage validation with tool parts kept static", async () => {
    const [validated] = await validateUIMessages({ messages: [v6Assistant], tools: getAllTools() })
    expect(validated.parts.map((part) => part.type)).toEqual([
      "step-start",
      "reasoning",
      "tool-deployContract",
      "tool-resolveDomain",
      "step-start",
      "text",
    ])
  })

  test("render on the chat page and the share page", () => {
    for (const html of [render(toUIMessages(storedChat)), render(storedChat)]) {
      expect(html).toContain("Thought for a few seconds")
      expect(html).toContain("DeployContract")
      expect(html).toContain("ResolveDomain failed")
      expect(html).toContain("Deployed your token at 0xC0FFEE.")
      expect(html).toContain("An AI SDK 4 era answer")
    }
  })

  test("are sent back to the model as history, without client system messages", async () => {
    const userMessage: UIMessage = { id: "u2", parts: [{ text: "Thanks!", type: "text" }], role: "user" }
    const response = await POST(
      new Request("http://localhost/api/chat", {
        body: JSON.stringify({
          agentId: "agent_web3gpt",
          chatId: "chat-1",
          messages: [...toUIMessages(storedChat), userMessage],
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }) as never
    )
    expect(response.status).toBe(200)
    await response.text()

    const [call] = model.doStreamCalls
    const systemMessages = call.prompt.filter((message) => message.role === "system")
    expect(systemMessages).toHaveLength(1)
    expect(String(systemMessages[0].content)).toStartWith("server instructions")

    const toolCalls = call.prompt.flatMap((message) =>
      message.role === "assistant" ? message.content.filter((part) => part.type === "tool-call") : []
    )
    expect(toolCalls.map((part) => part.toolName)).toEqual(["deployContract", "resolveDomain"])

    const toolResults = call.prompt.flatMap((message) => (message.role === "tool" ? message.content : []))
    expect(toolResults).toContainEqual(
      expect.objectContaining({ output: { type: "text", value: DEPLOY_OUTPUT }, toolCallId: "call_1" })
    )
    expect(toolResults).toContainEqual(
      expect.objectContaining({ output: { type: "error-text", value: "Domain not found" }, toolCallId: "call_2" })
    )

    // The stored chat keeps the old turn as it was and appends the new one.
    expect(stored).toHaveLength(1)
    expect(stored[0]).toContainEqual(v6Assistant)
    expect(stored[0].at(-1)?.parts).toContainEqual(expect.objectContaining({ text: "Anything else?", type: "text" }))
  })
})
