import { beforeEach, describe, expect, mock, test } from "bun:test"
import { getSuggestedEmail, isGithubNoreplyEmail, isValidEmail, normalizeEmail } from "@/lib/email"

// In-memory stand-in for the parts of the Redis client the updates actions use.
type Hash = Record<string, unknown>
const hashes = new Map<string, Hash>()
const sets = new Map<string, Set<string>>()
const counters = new Map<string, number>()

const fakeRedis = {
  expire: () => Promise.resolve(1),
  hdel: (key: string, ...fields: string[]) => {
    const hash = { ...(hashes.get(key) ?? {}) }
    for (const field of fields) {
      delete hash[field]
    }
    hashes.set(key, hash)
    return Promise.resolve(fields.length)
  },
  hget: (key: string, field: string) => Promise.resolve(hashes.get(key)?.[field] ?? null),
  hgetall: (key: string) => Promise.resolve(hashes.get(key) ?? null),
  hset: (key: string, data: Hash) => {
    hashes.set(key, { ...(hashes.get(key) ?? {}), ...data })
    return Promise.resolve(Object.keys(data).length)
  },
  incr: (key: string) => {
    const next = (counters.get(key) ?? 0) + 1
    counters.set(key, next)
    return Promise.resolve(next)
  },
  sadd: (key: string, member: string) => {
    const set = sets.get(key) ?? new Set<string>()
    set.add(member)
    sets.set(key, set)
    return Promise.resolve(1)
  },
  srem: (key: string, member: string) => Promise.resolve(sets.get(key)?.delete(member) ? 1 : 0),
}

let sessionUserId: string | null = null
let clientIp = "203.0.113.1"

mock.module("server-only", () => ({}))
mock.module("@/lib/redis", () => ({ redis: fakeRedis }))
mock.module("next/headers", () => ({ headers: () => Promise.resolve(new Headers({ "x-real-ip": clientIp })) }))
mock.module("@/lib/auth", () => ({
  getSession: () => Promise.resolve(sessionUserId ? { user: { id: sessionUserId } } : null),
}))

const { getUpdatesSubscriptionAction, subscribeToUpdatesAction, unsubscribeFromUpdatesAction } = await import(
  "@/lib/actions/updates"
)

const USER = "1001"
const listed = () => [...(sets.get("emails:list") ?? [])]

beforeEach(() => {
  hashes.clear()
  sets.clear()
  counters.clear()
  sessionUserId = null
  clientIp = "203.0.113.1"
})

describe("email helpers", () => {
  test("normalize and validate", () => {
    expect(normalizeEmail("  Person@Example.COM ")).toBe("person@example.com")
    expect(isValidEmail("person@example.com")).toBe(true)
    expect(isValidEmail("not an email")).toBe(false)
    expect(isValidEmail(`${"a".repeat(300)}@x.io`)).toBe(false)
  })

  test("never suggest GitHub's noreply placeholder", () => {
    expect(isGithubNoreplyEmail("1+octo@users.noreply.github.com")).toBe(true)
    expect(getSuggestedEmail("1+octo@users.noreply.github.com")).toBeNull()
    expect(getSuggestedEmail(" Octo@Example.com")).toBe("octo@example.com")
    expect(getSuggestedEmail(undefined)).toBeNull()
  })
})

describe("subscribeToUpdatesAction", () => {
  test("rejects junk with a message instead of pretending to succeed", async () => {
    expect(await subscribeToUpdatesAction("not an email")).toEqual({ error: "Enter a valid email address.", ok: false })
    expect((await subscribeToUpdatesAction(`${"a".repeat(300)}@x.io`)).ok).toBe(false)
    expect((await subscribeToUpdatesAction({ email: "a@b.co" })).ok).toBe(false)
    expect(listed()).toEqual([])
  })

  test("normalizes and stores anonymous sign-ups", async () => {
    expect(await subscribeToUpdatesAction("  Person@Example.COM ")).toEqual({ email: "person@example.com", ok: true })
    expect(listed()).toEqual(["person@example.com"])
  })

  test("records the address on the signed-in account", async () => {
    sessionUserId = USER
    await subscribeToUpdatesAction("me@example.com")
    expect(hashes.get(`user:details:${USER}`)).toMatchObject({ email_subscribed: true, subscribed_email: "me@example.com" })
  })

  test("is rate limited per IP", async () => {
    for (let i = 0; i < 5; i += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: sequential hits against one counter
      expect((await subscribeToUpdatesAction(`p${i}@example.com`)).ok).toBe(true)
    }
    const refused = await subscribeToUpdatesAction("p5@example.com")
    expect(refused.ok).toBe(false)
    expect(listed()).not.toContain("p5@example.com")

    clientIp = "203.0.113.2"
    expect((await subscribeToUpdatesAction("p5@example.com")).ok).toBe(true)
  })
})

describe("subscription state", () => {
  test("requires a session", async () => {
    expect(await getUpdatesSubscriptionAction()).toBeUndefined()
    expect(await unsubscribeFromUpdatesAction()).toBeUndefined()
  })

  test("reports state and a usable suggested address", async () => {
    sessionUserId = USER
    hashes.set(`user:details:${USER}`, { email: "Me@Example.com" })
    expect(await getUpdatesSubscriptionAction()).toEqual({
      email: null,
      subscribed: false,
      suggestedEmail: "me@example.com",
    })

    hashes.set(`user:details:${USER}`, { email: "1+me@users.noreply.github.com", email_subscribed: "true" })
    expect(await getUpdatesSubscriptionAction()).toMatchObject({ subscribed: true, suggestedEmail: null })
  })

  test("unsubscribe removes only this account's address", async () => {
    sessionUserId = USER
    await subscribeToUpdatesAction("me@example.com")
    await fakeRedis.sadd("emails:list", "someone-else@example.com")

    expect(await unsubscribeFromUpdatesAction()).toBe(true)
    expect(listed()).toEqual(["someone-else@example.com"])
    expect(await getUpdatesSubscriptionAction()).toMatchObject({ email: null, subscribed: false })
  })

  test("unsubscribe clears the flag for legacy records without an address", async () => {
    sessionUserId = USER
    hashes.set(`user:details:${USER}`, { email_subscribed: true })
    await fakeRedis.sadd("emails:list", "legacy@example.com")

    await unsubscribeFromUpdatesAction()
    expect(hashes.get(`user:details:${USER}`)?.email_subscribed).toBe(false)
    expect(listed()).toEqual(["legacy@example.com"])
  })
})
