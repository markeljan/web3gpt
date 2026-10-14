import { describe, expect, mock, test } from "bun:test"

mock.module("server-only", () => ({}))
mock.module("@/lib/redis", () => ({ redis: {} }))

const { getClientIp, getWindow, hitRateLimit, hitRateLimits, rateLimitKey } = await import("@/lib/rate-limit")
const { checkDeployAllowance, getCallerId, isMainnetChain } = await import("@/lib/deploy-limits")

const memoryStore = () => {
  const counts = new Map<string, number>()
  const expirations = new Map<string, number>()
  return {
    counts,
    expirations,
    expire: (key: string, seconds: number) => {
      expirations.set(key, seconds)
      return Promise.resolve(1)
    },
    incr: (key: string) => {
      const next = (counts.get(key) ?? 0) + 1
      counts.set(key, next)
      return Promise.resolve(next)
    },
  }
}

const failingStore = {
  expire: () => Promise.reject(new Error("kv down")),
  incr: () => Promise.reject(new Error("kv down")),
}

const rule = { bucket: "test", limit: 3, windowSeconds: 60 }
const NOW = 1_700_000_000_000

describe("fixed-window rate limiter", () => {
  test("allows up to the limit, then refuses", async () => {
    const store = memoryStore()
    const results: Awaited<ReturnType<typeof hitRateLimit>>[] = []
    for (let i = 0; i < 4; i += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: hits must be counted in order
      results.push(await hitRateLimit(rule, "ip-1", { now: NOW, store }))
    }
    expect(results.map((r) => r.ok)).toEqual([true, true, true, false])
    expect(results.map((r) => r.remaining)).toEqual([2, 1, 0, 0])
  })

  test("sets an expiry only when a window opens", async () => {
    const store = memoryStore()
    await hitRateLimit(rule, "ip-1", { now: NOW, store })
    await hitRateLimit(rule, "ip-1", { now: NOW, store })
    expect(store.expirations.size).toBe(1)
    expect([...store.expirations.values()][0]).toBeGreaterThanOrEqual(60)
  })

  test("counts ids and windows separately", async () => {
    const store = memoryStore()
    for (let i = 0; i < 3; i += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: hits must be counted in order
      await hitRateLimit(rule, "ip-1", { now: NOW, store })
    }
    expect((await hitRateLimit(rule, "ip-2", { now: NOW, store })).ok).toBe(true)
    expect((await hitRateLimit(rule, "ip-1", { now: NOW + 60_000, store })).ok).toBe(true)
  })

  test("window keys and reset times line up", () => {
    const { index, resetSeconds } = getWindow(NOW, 60)
    expect(rateLimitKey(rule, "x", index)).toBe(`ratelimit:test:x:${index}`)
    expect(resetSeconds).toBeGreaterThan(0)
    expect(resetSeconds).toBeLessThanOrEqual(60)
  })

  test("fails open or closed as asked when KV is down", async () => {
    expect((await hitRateLimit(rule, "x", { failOpen: true, store: failingStore })).ok).toBe(true)
    expect((await hitRateLimit(rule, "x", { failOpen: false, store: failingStore })).ok).toBe(false)
  })

  test("hitRateLimits stops at the first exceeded rule without spending later ones", async () => {
    const store = memoryStore()
    const tight = { bucket: "tight", limit: 0, windowSeconds: 60 }
    const loose = { bucket: "loose", limit: 10, windowSeconds: 60 }
    const result = await hitRateLimits(
      [
        { id: "a", rule: tight },
        { id: "a", rule: loose },
      ],
      { now: NOW, store }
    )
    expect(result.ok).toBe(false)
    expect(result.bucket).toBe("tight")
    expect([...store.counts.keys()].some((key) => key.includes("loose"))).toBe(false)
  })
})

describe("client IP", () => {
  test("prefers platform headers over client-controlled x-forwarded-for", () => {
    const headers = new Headers({
      "x-forwarded-for": "6.6.6.6, 1.1.1.1",
      "x-real-ip": "2.2.2.2",
      "x-vercel-forwarded-for": "3.3.3.3",
    })
    expect(getClientIp(headers)).toBe("3.3.3.3")
    expect(getClientIp(new Headers({ "x-real-ip": "2.2.2.2" }))).toBe("2.2.2.2")
    expect(getClientIp(new Headers({ "x-forwarded-for": "4.4.4.4, 5.5.5.5" }))).toBe("4.4.4.4")
    expect(getClientIp(new Headers())).toBe("unknown")
  })
})

describe("server wallet deployment limits", () => {
  test("only Polygon mainnet (and unknown chains) count as mainnet", () => {
    expect(isMainnetChain(137)).toBe(true)
    expect(isMainnetChain(80_002)).toBe(false)
    expect(isMainnetChain(84_532)).toBe(false)
    expect(isMainnetChain(11_155_111)).toBe(false)
    expect(isMainnetChain(999_999)).toBe(true)
  })

  test("caller ids distinguish users from anonymous IPs", () => {
    expect(getCallerId({ ip: "1.1.1.1", userId: "42" })).toBe("user:42")
    expect(getCallerId({ ip: "1.1.1.1" })).toBe("ip:1.1.1.1")
    expect(getCallerId({})).toBe("ip:unknown")
  })

  const recordingHit = (refuseBucket?: string) => {
    const calls: { bucket: string; id: string; failOpen?: boolean }[] = []
    const hit = (r: { bucket: string; limit: number }, id: string, options?: { failOpen?: boolean }) => {
      calls.push({ bucket: r.bucket, failOpen: options?.failOpen, id })
      const ok = r.bucket !== refuseBucket
      return Promise.resolve({ limit: r.limit, ok, remaining: ok ? 1 : 0, resetSeconds: 7200 })
    }
    return { calls, hit: hit as unknown as typeof hitRateLimit }
  }

  test("mainnet checks the caller and then the global budget, failing closed", async () => {
    const { calls, hit } = recordingHit()
    expect(await checkDeployAllowance({ callerId: "ip:1.1.1.1", chainId: 137 }, hit)).toEqual({ ok: true })
    expect(calls).toEqual([
      { bucket: "deploy:mainnet", failOpen: false, id: "ip:1.1.1.1" },
      { bucket: "deploy:mainnet:global", failOpen: false, id: "all" },
    ])
  })

  test("a caller over its mainnet limit doesn't consume the global budget", async () => {
    const { calls, hit } = recordingHit("deploy:mainnet")
    const result = await checkDeployAllowance({ callerId: "ip:1.1.1.1", chainId: 137 }, hit)
    expect(result.ok).toBe(false)
    expect(calls.map((c) => c.bucket)).toEqual(["deploy:mainnet"])
  })

  test("an exhausted global mainnet budget refuses with a helpful reason", async () => {
    const { hit } = recordingHit("deploy:mainnet:global")
    const result = await checkDeployAllowance({ callerId: "user:1", chainId: 137 }, hit)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toContain("testnet")
      expect(result.reason).toContain("2 hour")
    }
  })

  test("testnets use the per-caller hourly limit and fail open", async () => {
    const { calls, hit } = recordingHit()
    expect(await checkDeployAllowance({ callerId: "ip:1.1.1.1", chainId: 80_002 }, hit)).toEqual({ ok: true })
    expect(calls).toEqual([{ bucket: "deploy:testnet", failOpen: true, id: "ip:1.1.1.1" }])
  })
})
