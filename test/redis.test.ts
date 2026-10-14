import { afterEach, describe, expect, mock, test } from "bun:test"

mock.module("server-only", () => ({}))

const { createRedisClient, redis, resolveRedisCredentials } = await import("@/lib/redis")

const UPSTASH = { UPSTASH_REDIS_REST_TOKEN: "upstash-token", UPSTASH_REDIS_REST_URL: "https://upstash.example" }
const MISSING_CREDENTIALS = /UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.*KV_REST_API_URL and KV_REST_API_TOKEN/
const KV = { KV_REST_API_TOKEN: "kv-token", KV_REST_API_URL: "https://kv.example" }

describe("resolveRedisCredentials", () => {
  test("prefers the Upstash integration's variables", () => {
    expect(resolveRedisCredentials({ ...KV, ...UPSTASH })).toEqual({
      token: "upstash-token",
      url: "https://upstash.example",
    })
  })

  test("falls back to the legacy Vercel KV variables", () => {
    expect(resolveRedisCredentials(KV)).toEqual({ token: "kv-token", url: "https://kv.example" })
  })

  test("never pairs a URL from one store with a token from another", () => {
    const env = { ...KV, UPSTASH_REDIS_REST_TOKEN: "", UPSTASH_REDIS_REST_URL: "https://upstash.example" }
    expect(resolveRedisCredentials(env)).toEqual({ token: "kv-token", url: "https://kv.example" })
  })

  test("fails clearly when neither pair is set", () => {
    expect(() => resolveRedisCredentials({ KV_REST_API_URL: "https://kv.example" })).toThrow(MISSING_CREDENTIALS)
  })
})

describe("redis client", () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test("importing the module does not need credentials", () => {
    expect(redis).toBeDefined()
  })

  test("keeps @vercel/kv's behaviour: deserialized values, cache default, no telemetry", async () => {
    const requests: { body: unknown; headers: Headers; init: RequestInit; url: string }[] = []
    globalThis.fetch = mock((input: string | URL | Request, init: RequestInit = {}) => {
      requests.push({
        body: JSON.parse(String(init.body)),
        headers: new Headers(init.headers),
        init,
        url: String(input),
      })
      // Answer every queued command (auto-pipelining batches them) with a numeric string or a JSON
      // object, base64-encoded as the client requests by default.
      const commands = JSON.parse(String(init.body)) as string[][]
      const results = commands.map(([command]) => ({ result: btoa(command === "hget" ? "1001" : '{"a":1}') }))
      return Promise.resolve(Response.json(results))
    }) as unknown as typeof fetch

    const client = createRedisClient(KV)
    const [owner, artifact] = await Promise.all([client.hget("chat:1", "userId"), client.get("wallet-deploy:1")])

    expect(owner).toBe(1001)
    expect(artifact).toEqual({ a: 1 })
    expect(requests).toHaveLength(1)
    expect(requests[0].url).toBe("https://kv.example/pipeline")
    expect(requests[0].init.cache).toBe("default")
    expect(requests[0].headers.get("authorization")).toBe("Bearer kv-token")
    expect([...requests[0].headers.keys()].some((name) => name.startsWith("upstash-telemetry"))).toBe(false)
  })
})
