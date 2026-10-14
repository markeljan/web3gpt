import { beforeEach, describe, expect, mock, test } from "bun:test"
import type { UIMessage } from "ai"
import { simulateReadableStream } from "ai"
import { MockLanguageModelV3 } from "ai/test"

// Drives the real /api/chat handler with a scripted model: the first model step
// calls the deployContract tool, the second answers in text. The stored chat
// must keep the tool call and its result, not only the text.

const usage = {
  inputTokens: { cacheRead: 0, cacheWrite: 0, noCache: 1, total: 1 },
  outputTokens: { reasoning: 0, text: 1, total: 1 },
}

const DEPLOY_SUMMARY_START = "Contract deployed on chain ID 80002. Contract address: 0xC0FFEE."

const scriptedModel = () => {
  let call = 0
  return new MockLanguageModelV3({
    doStream: () => {
      call += 1
      // Typed loosely: the provider stream-part union lives in a transitive package.
      const chunks: Record<string, unknown>[] =
        call === 1
          ? [
              {
                input: JSON.stringify({
                  chainId: 80_002,
                  constructorArgs: [],
                  contractName: "Token",
                  sourceCode: "contract Token {}",
                }),
                toolCallId: "call-1",
                toolName: "deployContract",
                type: "tool-call" as const,
              },
              { finishReason: { raw: "tool_calls", unified: "tool-calls" as const }, type: "finish" as const, usage },
            ]
          : [
              { id: "t1", type: "text-start" as const },
              { delta: "Deployed your token.", id: "t1", type: "text-delta" as const },
              { id: "t1", type: "text-end" as const },
              { finishReason: { raw: "stop", unified: "stop" as const }, type: "finish" as const, usage },
            ]
      return Promise.resolve({ stream: simulateReadableStream({ chunks }) as never })
    },
  })
}

let model = scriptedModel()
let sessionUserId: string | null = "1001"
const stored: { messages: UIMessage[]; title: string }[] = []

mock.module("server-only", () => ({}))
mock.module("@vercel/kv", () => ({ kv: { expire: () => Promise.resolve(1), incr: () => Promise.resolve(1) } }))
mock.module("@ai-sdk/openai", () => ({ openai: () => model }))
mock.module("@/lib/auth", () => ({
  getSession: () => Promise.resolve(sessionUserId ? { user: { id: sessionUserId, image: null } } : null),
}))
mock.module("@/lib/data/agents", () => ({
  getAgentById: () =>
    Promise.resolve({ id: "agent_web3gpt", instructions: "test", name: "Web3GPT", toolNames: ["deployContract"] }),
}))
mock.module("@/lib/data/kv", () => ({
  getChatOwnerId: () => Promise.resolve(null),
  storeAgentDirect: () => Promise.resolve(),
  storeChat: ({ data }: { data: { messages: UIMessage[]; title: string } }) => {
    stored.push({ messages: data.messages, title: data.title })
    return Promise.resolve(true)
  },
}))
mock.module("@/lib/deploy-limits", () => ({
  checkDeployAllowance: () => Promise.resolve({ ok: true }),
  getCallerId: () => "user:1001",
}))
mock.module("@/lib/solidity/deploy", () => ({
  deployContract: () =>
    Promise.resolve({
      chainId: 80_002,
      contractAddress: "0xC0FFEE",
      explorerUrl: "https://amoy.polygonscan.com/address/0xC0FFEE",
      ipfsUrl: "https://ipfs.example/ipfs/cid",
      transactionExplorerUrl: "https://amoy.polygonscan.com/tx/0xabc",
      transactionHash: "0xabc",
    }),
}))

const { POST } = await import("@/app/api/chat/route")

const userMessage: UIMessage = { id: "u1", parts: [{ text: "Deploy a token on Amoy", type: "text" }], role: "user" }

const postChat = (body: unknown) =>
  POST(
    new Request("http://localhost/api/chat", {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method: "POST",
    }) as never
  )

const waitFor = async (predicate: () => boolean) => {
  for (let i = 0; i < 100 && !predicate(); i += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: polling for the async onFinish
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

beforeEach(() => {
  model = scriptedModel()
  sessionUserId = "1001"
  stored.length = 0
})

describe("/api/chat persistence", () => {
  test("stores the tool call and its result alongside the text", async () => {
    const response = await postChat({ agentId: "agent_web3gpt", chatId: "chat-1", messages: [userMessage] })
    expect(response.status).toBe(200)
    await response.text()
    await waitFor(() => stored.length > 0)

    expect(stored).toHaveLength(1)
    const [saved] = stored
    expect(saved.title).toBe("Deploy a token on Amoy")
    expect(saved.messages.map((m) => m.role)).toEqual(["user", "assistant"])

    const [, assistant] = saved.messages
    expect(assistant.id).toBeTruthy()
    const toolPart = assistant.parts.find((part) => part.type === "tool-deployContract") as
      | { state: string; output: unknown }
      | undefined
    expect(toolPart?.state).toBe("output-available")
    expect(String(toolPart?.output)).toStartWith(DEPLOY_SUMMARY_START)
    expect(assistant.parts.some((part) => part.type === "text" && part.text === "Deployed your token.")).toBe(true)
  })

  test("still persists when the client disconnects before reading the stream", async () => {
    const response = await postChat({ agentId: "agent_web3gpt", chatId: "chat-2", messages: [userMessage] })
    await response.body?.cancel()
    await waitFor(() => stored.length > 0)
    expect(stored).toHaveLength(1)
    expect(stored[0].messages[1].parts.some((part) => part.type === "tool-deployContract")).toBe(true)
  })

  test("does not persist anonymous chats", async () => {
    sessionUserId = null
    const response = await postChat({ agentId: "agent_web3gpt", chatId: "chat-3", messages: [userMessage] })
    await response.text()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(stored).toHaveLength(0)
  })
})
