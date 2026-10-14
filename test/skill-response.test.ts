import { beforeEach, describe, expect, mock, test } from "bun:test"
import { MockLanguageModelV4 } from "ai/test"

// /api/skill answers with plain text. When the last model step has no text (the
// step limit hit mid tool loop), the answer falls back to assistant text from
// earlier steps. AI SDK 7 narrowed `result.response.messages` to the final step,
// which would silently drop that text; the route reads `responseMessages`.

const usage = {
  inputTokens: { cacheRead: 0, cacheWrite: 0, noCache: 1, total: 1 },
  outputTokens: { reasoning: 0, text: 1, total: 1 },
}

const toolCall = (n: number) => ({
  input: JSON.stringify({ domain: `name${n}.eth`, ticker: "ETH" }),
  toolCallId: `call-${n}`,
  toolName: "resolveDomain",
  type: "tool-call" as const,
})

const toolLoopModel = () => {
  let call = 0
  return new MockLanguageModelV4({
    doGenerate: () => {
      call += 1
      return Promise.resolve({
        content:
          call === 1 ? [{ text: "Looking those names up.", type: "text" as const }, toolCall(call)] : [toolCall(call)],
        finishReason: { raw: "tool_calls", unified: "tool-calls" as const },
        usage,
        warnings: [],
      })
    },
  })
}

let model = toolLoopModel()
const saved: { messages: { role: string; parts: { text?: string }[] }[] }[] = []

mock.module("server-only", () => ({}))
mock.module("@/lib/redis", () => ({ redis: { expire: () => Promise.resolve(1), incr: () => Promise.resolve(1) } }))
mock.module("@ai-sdk/openai", () => ({ openai: () => model }))
mock.module("@/lib/data/agents", () => ({
  getAgentById: () =>
    Promise.resolve({ id: "agent_web3gpt", instructions: "test", name: "Web3GPT", toolNames: ["resolveDomain"] }),
}))
mock.module("@/lib/data/kv", () => ({
  getSkillChat: () => Promise.resolve(null),
  storeAgentDirect: () => Promise.resolve(),
  storeSkillChat: (chat: (typeof saved)[number]) => {
    saved.push(chat)
    return Promise.resolve()
  },
}))
mock.module("@/lib/deploy-limits", () => ({
  checkDeployAllowance: () => Promise.resolve({ ok: true }),
  getCallerId: () => "ip:127.0.0.1",
}))
mock.module("@/lib/solidity/deploy", () => ({ deployContract: () => Promise.reject(new Error("not called")) }))
mock.module("@/lib/actions/unstoppable-domains", () => ({
  resolveAddress: () => Promise.resolve(""),
  resolveDomain: (domain: string) => Promise.resolve(`0x${domain.length}`),
}))

const { POST } = await import("@/app/api/skill/route")

beforeEach(() => {
  model = toolLoopModel()
  saved.length = 0
})

describe("/api/skill response text", () => {
  test("keeps assistant text from earlier steps when the final step has none", async () => {
    const request = new Request("http://localhost/api/skill", {
      body: JSON.stringify({ chatId: "skill-1", message: "Resolve some names" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    })
    Object.assign(request, { nextUrl: new URL(request.url) })
    const response = await POST(request as never)
    const body = (await response.json()) as { response: string | null }

    expect(model.doGenerateCalls).toHaveLength(5)
    expect(body.response).toBe("Looking those names up.")
    expect(saved[0].messages.at(-1)?.parts[0].text).toBe("Looking those names up.")
  })
})
