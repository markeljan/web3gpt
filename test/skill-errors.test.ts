import { beforeEach, describe, expect, mock, test } from "bun:test"

// Bad input to /api/skill must get a JSON error, never a 200 that quietly creates
// a chat. Agents read the status and `code` to decide what to fix.

const saved: unknown[] = []

mock.module("server-only", () => ({}))
mock.module("@/lib/redis", () => ({ redis: { expire: () => Promise.resolve(1), incr: () => Promise.resolve(1) } }))
mock.module("@/lib/data/agents", () => ({
  // Mirrors the real lookup: unknown ids fall back to the default agent.
  getAgentById: (id: string) =>
    Promise.resolve({ id: id === "agent_custom" ? id : "agent_web3gpt", instructions: "test", name: "Agent" }),
}))
mock.module("@/lib/data/kv", () => ({
  getSkillChat: () => Promise.resolve(null),
  storeAgentDirect: () => Promise.resolve(),
  storeSkillChat: (chat: unknown) => {
    saved.push(chat)
    return Promise.resolve()
  },
}))
mock.module("@/lib/deploy-limits", () => ({
  checkDeployAllowance: () => Promise.resolve({ ok: true }),
  getCallerId: () => "ip:127.0.0.1",
}))
mock.module("@/lib/solidity/deploy", () => ({ deployContract: () => Promise.reject(new Error("not called")) }))

const { POST } = await import("@/app/api/skill/route")
const { GET: notFound } = await import("@/app/api/[...path]/route")

const post = (body: string) => {
  const request = new Request("http://localhost/api/skill", {
    body,
    headers: { "content-type": "application/json" },
    method: "POST",
  })
  Object.assign(request, { nextUrl: new URL(request.url) })
  return POST(request as never)
}

beforeEach(() => {
  saved.length = 0
})

describe("/api/skill errors", () => {
  test("malformed JSON is a 400 and creates no chat", async () => {
    const response = await post("{bad")
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: "invalid_body" })
    expect(saved).toHaveLength(0)
  })

  test("a non-object JSON body is a 400", async () => {
    const response = await post("[1, 2]")
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: "invalid_body" })
  })

  test("an empty body still starts a chat", async () => {
    const response = await post("")
    expect(response.status).toBe(200)
    expect(saved).toHaveLength(1)
  })

  test("an unknown agentId is a 404 and creates no chat", async () => {
    const response = await post(JSON.stringify({ agentId: "agent_missing" }))
    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({ code: "agent_not_found" })
    expect(saved).toHaveLength(0)
  })

  test("a known custom agentId starts a chat", async () => {
    const response = await post(JSON.stringify({ agentId: "agent_custom" }))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ agentId: "agent_custom" })
  })
})

describe("unknown /api routes", () => {
  test("answer with a JSON 404", async () => {
    const response = notFound(new Request("http://localhost/api/nope"))
    expect(response.status).toBe(404)
    expect(response.headers.get("content-type")).toContain("application/json")
    expect(await response.json()).toMatchObject({ code: "not_found" })
  })
})
