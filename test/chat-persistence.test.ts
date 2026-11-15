import { beforeEach, describe, expect, mock, test } from "bun:test"
import type { UIMessage } from "ai"
import { convertToModelMessages, simulateReadableStream } from "ai"
import { MockLanguageModelV4 } from "ai/test"

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
  return new MockLanguageModelV4({
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
mock.module("@/lib/redis", () => ({ redis: { expire: () => Promise.resolve(1), incr: () => Promise.resolve(1) } }))
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
  test("rejects missing parts before agent lookup or persistence", async () => {
    const messages = [{ id: "u1", role: "user" }] as UIMessage[]
    // This reproduces a matching SDK failure, not proof of the production payload.
    await expect(convertToModelMessages(messages)).rejects.toBeInstanceOf(TypeError)
    const response = await postChat({ agentId: "agent_web3gpt", chatId: "bad", messages })
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: "Invalid messages" })
    expect(model.doStreamCalls).toHaveLength(0)
    expect(stored).toHaveLength(0)
  })

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

const CHAT_BODY_LIMIT = 1_000_000

const paddedChat = (byteLength: number, text: string) => {
  const json = JSON.stringify({
    agentId: "agent_web3gpt",
    messages: [{ ...userMessage, parts: [{ text, type: "text" }] }],
  })
  const bytes = new Uint8Array(byteLength).fill(32) // Trailing JSON whitespace
  bytes.set(new TextEncoder().encode(json))
  return bytes
}

const streamedChat = (chunks: Uint8Array[], cancel?: () => Promise<void>, contentLength?: string) => {
  const remaining = chunks.values()
  const pull = mock((controller: ReadableStreamDefaultController<Uint8Array>) => {
    const next = remaining.next()
    if (next.done) {
      controller.close()
    } else {
      controller.enqueue(next.value)
    }
  })
  const headers = new Headers({ "content-type": "application/json" })
  if (contentLength !== undefined) {
    headers.set("content-length", contentLength)
  }
  const body = new ReadableStream({ cancel, pull }, { highWaterMark: 0 })
  const options = { body, duplex: "half", headers, method: "POST" } as const
  const request = new Request("http://localhost/api/chat", options) as never
  return { pull, request }
}

describe("/api/chat body limit", () => {
  test("accepts exactly one million bytes with a UTF-8 character split across chunks", async () => {
    const text = "Launch 🚀"
    const bytes = paddedChat(CHAT_BODY_LIMIT, text)
    const split = bytes.indexOf(0xf0) + 2
    const { request } = streamedChat([bytes.subarray(0, split), bytes.subarray(split)])

    const response = await POST(request)

    expect(response.status).toBe(200)
    await response.text()
    expect(model.doStreamCalls[0]?.prompt.at(-1)?.content).toMatchObject([{ text, type: "text" }])
  })

  test.each([
    ["ASCII with no declared length", "Launch", undefined],
    ["UTF-8 with no declared length", "Launch 🚀", undefined],
    ["UTF-8 with an underreported length", "Launch 🚀", "100"],
  ])("rejects %s on the first byte over the limit", async (_label, text, contentLength) => {
    const cancellation = Promise.withResolvers<void>()
    const cancel = mock(() => cancellation.promise)
    const bytes = paddedChat(CHAT_BODY_LIMIT, text)
    const { pull, request } = streamedChat([bytes, Uint8Array.of(32), Uint8Array.of(32)], cancel, contentLength)

    try {
      const response = await POST(request)

      expect(response.status).toBe(413)
      expect(await response.json()).toEqual({ error: "Conversation is too large" })
      expect(pull).toHaveBeenCalledTimes(2)
      expect(cancel).toHaveBeenCalledTimes(1)
      expect(model.doStreamCalls).toHaveLength(0)
    } finally {
      cancellation.resolve()
    }
  })

  test("rejects an oversized declared length without pulling the body", async () => {
    const { pull, request } = streamedChat([Uint8Array.of(32)], undefined, String(CHAT_BODY_LIMIT + 1))

    const response = await POST(request)

    expect(response.status).toBe(413)
    expect(await response.json()).toEqual({ error: "Conversation is too large" })
    expect(pull).not.toHaveBeenCalled()
    expect(model.doStreamCalls).toHaveLength(0)
  })

  test("retains the malformed JSON response for streamed bodies", async () => {
    const { request } = streamedChat([new TextEncoder().encode('{"agentId":')])

    const response = await POST(request)

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: "messages and agentId are required" })
    expect(model.doStreamCalls).toHaveLength(0)
  })
})
