import { beforeEach, describe, expect, mock, test } from "bun:test"
import { errors } from "@upstash/redis"

// ---------------------------------------------------------------------------
// Stand-in for the Redis client that reproduces @upstash/redis's behaviour when
// a pipelined HGETALL hits a key that is not a hash: `exec({ keepErrors: true })`
// throws a TypeError instead of returning the error, while a direct HGETALL
// rejects with an UpstashError (WRONGTYPE).
// ---------------------------------------------------------------------------
const store = new Map<string, Record<string, unknown> | string>()
const networkFailures = new Set<string>()
let pipelineExecs = 0

const hgetall = (key: string) => {
  if (networkFailures.has(key)) {
    return Promise.reject(new TypeError("fetch failed"))
  }
  const value = store.get(key)
  if (typeof value === "string") {
    return Promise.reject(new errors.UpstashError("WRONGTYPE Operation against a key holding the wrong kind of value"))
  }
  return Promise.resolve(value ?? null)
}

const fakeRedis = {
  hgetall,
  pipeline: () => {
    const keys: string[] = []
    const p = {
      exec: (options?: { keepErrors?: boolean }) => {
        pipelineExecs += 1
        if (keys.some((key) => typeof store.get(key) === "string")) {
          return Promise.reject(
            options?.keepErrors
              ? new TypeError("undefined is not an object (evaluating 'result.length')")
              : new errors.UpstashError("Command 1 [ hgetall ] failed: WRONGTYPE")
          )
        }
        const results = keys.map((key) => store.get(key) ?? null)
        return Promise.resolve(options?.keepErrors ? results.map((result) => ({ result })) : results)
      },
      hgetall: (key: string) => {
        keys.push(key)
        return p
      },
    }
    return p
  },
  scan: (_cursor: number, { match }: { match: string }) => {
    const prefix = match.replace("*", "")
    return Promise.resolve(["0", [...store.keys()].filter((key) => key.startsWith(prefix))])
  },
}

mock.module("server-only", () => ({}))
mock.module("@/lib/redis", () => ({ redis: fakeRedis }))
mock.module("@/lib/auth", () => ({ getSession: () => Promise.resolve(null) }))

const { getAllDeployments, getVerifications } = await import("@/lib/data/kv")

beforeEach(() => {
  store.clear()
  networkFailures.clear()
  pipelineExecs = 0
})

describe("getVerifications", () => {
  test("reads every hash in one pipeline when all keys are hashes", async () => {
    store.set("verification:a", { deployHash: "0xa" })
    store.set("verification:b", { deployHash: "0xb" })

    const result = await getVerifications()

    expect(result.unreadable).toBe(0)
    expect(result.entries).toEqual([
      { data: { deployHash: "0xa" }, key: "verification:a" },
      { data: { deployHash: "0xb" }, key: "verification:b" },
    ])
    expect(pipelineExecs).toBe(1)
  })

  test("counts a non-hash key as unreadable instead of failing the whole scan", async () => {
    store.set("verification:a", { deployHash: "0xa" })
    store.set("verification:x", "not a hash")
    store.set("verification:b", { deployHash: "0xb" })

    const result = await getVerifications()

    expect(result.unreadable).toBe(1)
    expect(result.entries).toEqual([
      { data: { deployHash: "0xa" }, key: "verification:a" },
      { data: { deployHash: "0xb" }, key: "verification:b" },
    ])
  })

  test("still throws when Redis itself is unreachable", async () => {
    store.set("verification:a", { deployHash: "0xa" })
    store.set("verification:x", "not a hash")
    networkFailures.add("verification:a")

    await expect(getVerifications()).rejects.toThrow("fetch failed")
  })
})

describe("getAllDeployments", () => {
  test("skips a non-hash key instead of failing", async () => {
    store.set("deployment:a", { cid: "a" })
    store.set("deployment:x", "not a hash")
    store.set("deployment:b", { cid: "b" })
    const warn = mock(() => undefined)
    const originalWarn = console.warn
    console.warn = warn

    try {
      expect(await getAllDeployments()).toEqual([{ cid: "a" }, { cid: "b" }] as never)
    } finally {
      console.warn = originalWarn
    }
    expect(warn).toHaveBeenCalledTimes(1)
  })
})
