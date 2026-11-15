import { beforeEach, expect, mock, test } from "bun:test"
import { createOpenAI } from "@ai-sdk/openai"
import { NextRequest } from "next/server"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { ChatPanel } from "@/components/chat/chat-panel"
import { TooltipProvider } from "@/components/ui/tooltip"

const providerMessage = "provider-only fixture detail"
const providerCodes: string[] = []
const saved: unknown[] = []
let calls = 0
let streamError: "early" | "after-output" | undefined

const fixtureOpenAI = createOpenAI({
  apiKey: "fixture-api-key",
  baseURL: "https://provider.example.invalid/v1",
  fetch: Object.assign(
    () => {
      const code = providerCodes[Math.min(calls, providerCodes.length - 1)]
      calls += 1
      if (streamError) {
        const chunks =
          streamError === "early"
            ? [{ code, message: providerMessage, sequence_number: 0, type: "error" }]
            : [
                { item: { id: "msg_fixture", type: "message" }, output_index: 0, type: "response.output_item.added" },
                { delta: "partial answer", item_id: "msg_fixture", type: "response.output_text.delta" },
                {
                  response: { error: { code, message: providerMessage } },
                  sequence_number: 1,
                  type: "response.failed",
                },
              ]
        return Promise.resolve(
          new Response(chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join(""), {
            headers: { "Content-Type": "text/event-stream", "Retry-After": "0" },
          })
        )
      }
      return Promise.resolve(
        Response.json({ error: { code, message: providerMessage } }, { headers: { "Retry-After": "0" }, status: 429 })
      )
    },
    { preconnect: () => undefined }
  ),
})

mock.module("server-only", () => ({}))
mock.module("@ai-sdk/openai", () => ({ openai: fixtureOpenAI }))
mock.module("@/lib/auth", () => ({ getSession: () => Promise.resolve(null) }))
mock.module("@/lib/redis", () => ({ redis: { expire: () => Promise.resolve(1), incr: () => Promise.resolve(1) } }))
mock.module("@/lib/data/agents", () => ({
  getAgentById: () => Promise.resolve({ id: "agent_web3gpt", instructions: "fixture", toolNames: [] }),
}))
mock.module("@/lib/data/kv", () => ({
  getChatOwnerId: () => Promise.resolve(null),
  getSkillChat: () => Promise.resolve(null),
  storeChat: () => Promise.reject(new Error("anonymous chat must not persist")),
  storeSkillChat: (chat: unknown) => {
    saved.push(chat)
    return Promise.resolve()
  },
}))
mock.module("@/lib/tools", () => ({ getTools: () => ({}) }))

const { POST: postSkill } = await import("@/app/api/skill/route")
const { POST: postChat } = await import("@/app/api/chat/route")

const request = (path: string, body: unknown) =>
  new NextRequest(`http://localhost${path}`, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  })

const chatRequest = () =>
  request("/api/chat", {
    agentId: "agent_web3gpt",
    messages: [{ id: "u1", parts: [{ text: "fixture", type: "text" }], role: "user" }],
  })

beforeEach(() => {
  calls = 0
  streamError = undefined
  providerCodes.length = 0
  saved.length = 0
})

test.each(["insufficient_quota", "project_spend_limit_exceeded"])(
  "skill stops on terminal provider quota (%s)",
  async (code) => {
    providerCodes.push(code)
    const response = await postSkill(request("/api/skill", { chatId: "fixture-chat", message: "fixture" }))
    expect(calls).toBe(1)
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      agentId: "agent_web3gpt",
      chatId: "fixture-chat",
      code: "model_quota_exhausted",
      error: "The model provider's usage limit has been reached.",
    })
    expect(response.headers.get("retry-after")).toBeNull()
    expect(saved).toHaveLength(0)
  }
)

test("chat reports a quota error after one terminal OpenAI response", async () => {
  providerCodes.push("project_spend_limit_exceeded")
  const response = await postChat(chatRequest())
  const body = await response.text()
  expect(calls).toBe(1)
  expect(body).toContain("The model provider's usage limit has been reached.")
  expect(body).not.toContain(providerMessage)
})

test("an early OpenAI stream quota frame also stops after one attempt", async () => {
  providerCodes.push("project_spend_limit_exceeded")
  streamError = "early"
  const response = await postChat(chatRequest())
  const body = await response.text()
  expect(calls).toBe(1)
  expect(body).toContain("The model provider's usage limit has been reached.")
  expect(body).not.toContain(providerMessage)
})

test("chat keeps partial output and reports quota when a stream has started", async () => {
  providerCodes.push("project_spend_limit_exceeded")
  streamError = "after-output"
  const response = await postChat(chatRequest())
  const body = await response.text()
  expect(calls).toBe(1)
  expect(body).toContain("partial answer")
  expect(body).toContain("The model provider's usage limit has been reached.")
  expect(body).not.toContain(providerMessage)
})

test("the chat panel shows quota guidance and retains Retry for other errors", () => {
  const noop = () => undefined
  const render = (message: string) =>
    renderToStaticMarkup(
      createElement(
        TooltipProvider,
        null,
        createElement(ChatPanel, {
          error: new Error(message),
          isEmpty: false,
          isLoading: false,
          onNewChat: noop,
          onRetry: noop,
          onSubmit: noop,
          stop: noop,
        })
      )
    )
  const quota = render("The model provider's usage limit has been reached.")
  expect(quota).toContain("usage limit has been reached.")
  expect(quota).not.toContain("Retry")
  const other = render(providerMessage)
  expect(other).toContain("Something went wrong generating that response.")
  expect(other).toContain("Retry")
  expect(other).not.toContain(providerMessage)
})

test("ordinary provider rate limits retain the retry count and generic skill error", async () => {
  providerCodes.push("rate_limit_exceeded")
  const response = await postSkill(request("/api/skill", { message: "fixture" }))
  expect(calls).toBe(3)
  expect(response.status).toBe(500)
  expect(await response.json()).toMatchObject({ code: "internal_error" })
})

test("skill stops when a retryable rate limit is followed by terminal quota", async () => {
  providerCodes.push("rate_limit_exceeded", "insufficient_quota")
  const response = await postSkill(request("/api/skill", { message: "fixture" }))
  expect(calls).toBe(2)
  expect(response.status).toBe(503)
  expect(await response.json()).toMatchObject({ code: "model_quota_exhausted" })
})
