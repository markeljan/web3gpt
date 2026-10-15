import { beforeEach, describe, expect, mock, test } from "bun:test"
import { canWriteChat, isChatOwner, normalizeOwnerId } from "@/lib/chat-ownership"

// ---------------------------------------------------------------------------
// In-memory stand-in for the subset of the Redis client (@/lib/redis) these modules use. Values are
// stored as given, and numeric strings come back as numbers, mirroring the
// automatic deserialization that makes GitHub ids read back as numbers.
// ---------------------------------------------------------------------------
type Hash = Record<string, unknown>
const hashes = new Map<string, Hash>()
const zsets = new Map<string, Map<string, number>>()
const sets = new Map<string, Set<string>>()

const NUMERIC = /^\d+$/
const deserialize = (value: unknown) => (typeof value === "string" && NUMERIC.test(value) ? Number(value) : value)

const getHash = (key: string): Hash => hashes.get(key) ?? {}

const fakeKv = {
  del: (key: string) => Promise.resolve(hashes.delete(key) ? 1 : 0),
  hget: (key: string, field: string) => {
    const value = hashes.get(key)?.[field]
    return Promise.resolve(value === undefined ? null : deserialize(value))
  },
  hgetall: (key: string) => {
    const hash = hashes.get(key)
    return Promise.resolve(hash ? Object.fromEntries(Object.entries(hash).map(([k, v]) => [k, deserialize(v)])) : null)
  },
  hmset: (key: string, data: Hash) => {
    hashes.set(key, { ...getHash(key), ...data })
    return Promise.resolve("OK")
  },
  hset: (key: string, data: Hash) => {
    hashes.set(key, { ...getHash(key), ...data })
    return Promise.resolve(Object.keys(data).length)
  },
  hsetnx: (key: string, field: string, value: unknown) => {
    const hash = getHash(key)
    if (field in hash) {
      return Promise.resolve(0)
    }
    hashes.set(key, { ...hash, [field]: value })
    return Promise.resolve(1)
  },
  pipeline: () => {
    const ops: (() => Promise<unknown>)[] = []
    const p = {
      del: (key: string) => {
        ops.push(() => fakeKv.del(key))
        return p
      },
      exec: () => Promise.all(ops.map((op) => op())),
      hget: (key: string, field: string) => {
        ops.push(() => fakeKv.hget(key, field))
        return p
      },
      zrem: (key: string, member: string) => {
        ops.push(() => fakeKv.zrem(key, member))
        return p
      },
    }
    return p
  },
  sadd: (key: string, member: string) => {
    const set = sets.get(key) ?? new Set<string>()
    set.add(member)
    sets.set(key, set)
    return Promise.resolve(1)
  },
  zadd: (key: string, { member, score }: { member: string; score: number }) => {
    const zset = zsets.get(key) ?? new Map<string, number>()
    zset.set(member, score)
    zsets.set(key, zset)
    return Promise.resolve(1)
  },
  zrange: (key: string) => Promise.resolve([...(zsets.get(key)?.keys() ?? [])]),
  zrem: (key: string, member: string) => Promise.resolve(zsets.get(key)?.delete(member) ? 1 : 0),
}

let sessionUserId: string | null = null

mock.module("server-only", () => ({}))
mock.module("@/lib/redis", () => ({ redis: fakeKv }))
mock.module("next/cache", () => ({ updateTag: () => undefined }))
mock.module("@/lib/auth", () => ({
  getSession: () => Promise.resolve(sessionUserId ? { user: { id: sessionUserId } } : null),
}))

const { getChat, getPublishedChat, storeChat } = await import("@/lib/data/kv")
const { clearChatsAction, deleteChatAction, shareChatAction } = await import("@/lib/actions/chat")

const OWNER = "1001"
const ATTACKER = "2002"

const seedChat = (id: string, userId: string, extra: Hash = {}) => {
  hashes.set(`chat:${id}`, {
    agentId: "agent",
    createdAt: 1,
    id,
    messages: [{ id: "m1", parts: [{ text: "secret prompt", type: "text" }], role: "user" }],
    published: false,
    title: "secret prompt",
    userId,
    ...extra,
  })
  const index = zsets.get(`user:chat:${userId}`) ?? new Map<string, number>()
  index.set(`chat:${id}`, 1)
  zsets.set(`user:chat:${userId}`, index)
}

const chatRecord = (id: string, userId: string) => ({
  agentId: "agent",
  createdAt: Date.now(),
  id,
  messages: [],
  published: false,
  title: "overwritten",
  userId,
})

beforeEach(() => {
  hashes.clear()
  zsets.clear()
  sets.clear()
  sessionUserId = null
})

describe("chat ownership rules", () => {
  test("normalizes numeric and string ids", () => {
    expect(normalizeOwnerId(1001)).toBe("1001")
    expect(normalizeOwnerId("1001")).toBe("1001")
    expect(normalizeOwnerId("")).toBeNull()
    expect(normalizeOwnerId(undefined)).toBeNull()
    expect(normalizeOwnerId({})).toBeNull()
  })

  test("isChatOwner requires a known, matching owner", () => {
    expect(isChatOwner(1001, "1001")).toBe(true)
    expect(isChatOwner("1001", "1001")).toBe(true)
    expect(isChatOwner(null, "1001")).toBe(false)
    expect(isChatOwner(1001, "2002")).toBe(false)
    expect(isChatOwner(1001, undefined)).toBe(false)
  })

  test("canWriteChat allows claiming new chats but not foreign ones", () => {
    expect(canWriteChat(null, "1001")).toBe(true)
    expect(canWriteChat(1001, "1001")).toBe(true)
    expect(canWriteChat(1001, "2002")).toBe(false)
    expect(canWriteChat(null, undefined)).toBe(false)
  })
})

describe("getChat / getPublishedChat", () => {
  test("getChat returns only the caller's own chat", async () => {
    seedChat("c1", OWNER)
    sessionUserId = ATTACKER
    expect(await getChat("c1")).toBeNull()
    sessionUserId = OWNER
    expect((await getChat("c1"))?.id).toBe("c1")
  })

  test("getPublishedChat leaks nothing for unpublished chats", async () => {
    seedChat("c1", OWNER)
    expect(await getPublishedChat("c1")).toBeNull()
    hashes.set("chat:c1", { ...getHash("chat:c1"), published: true })
    expect((await getPublishedChat("c1"))?.title).toBe("secret prompt")
  })
})

describe("storeChat", () => {
  test("refuses to overwrite a chat owned by someone else", async () => {
    seedChat("victim", OWNER)
    sessionUserId = ATTACKER
    expect(await storeChat({ data: chatRecord("victim", ATTACKER), userId: ATTACKER })).toBe(false)
    expect(hashes.get("chat:victim")?.title).toBe("secret prompt")
    expect(String(hashes.get("chat:victim")?.userId)).toBe(OWNER)
    expect(zsets.get(`user:chat:${ATTACKER}`)).toBeUndefined()
  })

  test("claims a new chat id and keeps writing to it", async () => {
    sessionUserId = OWNER
    expect(await storeChat({ data: chatRecord("fresh", OWNER), userId: OWNER })).toBe(true)
    expect(await storeChat({ data: chatRecord("fresh", OWNER), userId: OWNER })).toBe(true)
    expect(String(hashes.get("chat:fresh")?.userId)).toBe(OWNER)
  })

  test("refuses records whose userId differs from the session", async () => {
    sessionUserId = ATTACKER
    expect(await storeChat({ data: chatRecord("x", OWNER), userId: ATTACKER })).toBe(false)
    expect(hashes.has("chat:x")).toBe(false)
  })
})

describe("chat server actions", () => {
  test("shareChatAction cannot publish or rewrite another user's chat", async () => {
    seedChat("victim", OWNER)
    sessionUserId = ATTACKER
    expect(await shareChatAction("victim")).toBe(false)
    expect(hashes.get("chat:victim")?.published).toBe(false)
  })

  test("shareChatAction only flips published for the owner", async () => {
    seedChat("mine", OWNER)
    sessionUserId = OWNER
    expect(await shareChatAction("mine")).toBe(true)
    const stored = getHash("chat:mine")
    expect(stored.published).toBe(true)
    expect(stored.title).toBe("secret prompt")
  })

  test("shareChatAction rejects the old object payload shape", async () => {
    seedChat("victim", OWNER)
    sessionUserId = ATTACKER
    // The pre-fix client sent a whole chat object; it must not be honored.
    const forged = { id: "victim", published: true, title: "pwned", userId: ATTACKER } as unknown as string
    expect(await shareChatAction(forged)).toBe(false)
    expect(hashes.get("chat:victim")?.title).toBe("secret prompt")
  })

  test("deleteChatAction cannot delete another user's chat", async () => {
    seedChat("victim", OWNER)
    sessionUserId = ATTACKER
    expect(await deleteChatAction("victim")).toBe(false)
    expect(hashes.has("chat:victim")).toBe(true)
  })

  test("deleteChatAction deletes the owner's chat", async () => {
    seedChat("mine", OWNER)
    sessionUserId = OWNER
    expect(await deleteChatAction("mine")).toBe(true)
    expect(hashes.has("chat:mine")).toBe(false)
    expect(zsets.get(`user:chat:${OWNER}`)?.has("chat:mine")).toBe(false)
  })

  test("clearChatsAction only deletes chats the caller owns", async () => {
    seedChat("mine", OWNER)
    seedChat("victim", ATTACKER)
    // A stale foreign key in the caller's own index must not be deleted.
    await fakeKv.zadd(`user:chat:${OWNER}`, { member: "chat:victim", score: 2 })
    sessionUserId = OWNER
    await clearChatsAction()
    expect(hashes.has("chat:mine")).toBe(false)
    expect(hashes.has("chat:victim")).toBe(true)
    expect(zsets.get(`user:chat:${OWNER}`)?.size).toBe(0)
  })

  test("actions do nothing without a session", async () => {
    seedChat("c1", OWNER)
    expect(await shareChatAction("c1")).toBeUndefined()
    expect(await deleteChatAction("c1")).toBeUndefined()
    expect(hashes.has("chat:c1")).toBe(true)
  })
})
