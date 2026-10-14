"use server"
import { updateTag } from "next/cache"
import { getSession } from "@/lib/auth"
import { isChatOwner } from "@/lib/chat-ownership"
import { getChatOwnerId, withUser } from "@/lib/data/kv"
import { redis } from "@/lib/redis"

// Server actions are public HTTP endpoints: every argument is attacker-controlled
// and ownership has to be read from KV, never from the payload.

const MAX_EMAIL_LENGTH = 254
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const shareChatAction = withUser<string, boolean>(async (chatId, userId) => {
  if (typeof chatId !== "string" || !isChatOwner(await getChatOwnerId(chatId), userId)) {
    return false
  }

  // Only flip the flag. Writing a client-supplied record here would let the
  // caller rewrite the title or owner.
  await redis.hset(`chat:${chatId}`, { published: true })
  updateTag("chat-list")
  return true
})

export const deleteChatAction = withUser<string, boolean>(async (chatId, userId) => {
  if (typeof chatId !== "string") {
    return false
  }

  const owned = isChatOwner(await getChatOwnerId(chatId), userId)
  // Dropping the id from the caller's own index is always safe; deleting the
  // record is only allowed for its owner.
  await Promise.all([owned ? redis.del(`chat:${chatId}`) : null, redis.zrem(`user:chat:${userId}`, `chat:${chatId}`)])

  updateTag("chat-list")
  return owned
})

export async function storeEmailAction(email: string) {
  if (typeof email !== "string") {
    return
  }
  const normalizedEmail = email.trim().toLowerCase()
  if (normalizedEmail.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(normalizedEmail)) {
    return
  }

  await redis.sadd("emails:list", normalizedEmail)

  const session = await getSession()
  const userId = session?.user.id

  if (userId) {
    await redis.hmset(`user:details:${userId}`, {
      email_subscribed: true,
    })
  }
}

// Only fields the client legitimately reads. This action used to return any
// field of the caller's own record, which was harmless but needlessly broad.
const READABLE_USER_FIELDS = new Set(["email_subscribed"])

export const getUserFieldAction = withUser<string, string | null>(async (fieldName, userId) => {
  if (!READABLE_USER_FIELDS.has(fieldName)) {
    return null
  }
  const value = await redis.hget<string | boolean>(`user:details:${userId}`, fieldName)
  // The client treats any non-null value as "set", so falsy values read as null.
  return value === null || value === undefined || value === false || value === "false" ? null : String(value)
})

export const clearChatsAction = withUser<void, void>(async (_, userId) => {
  const chatKeys: string[] = await redis.zrange(`user:chat:${userId}`, 0, -1)
  if (!chatKeys.length) {
    return
  }

  const ownerLookup = redis.pipeline()
  for (const key of chatKeys) {
    ownerLookup.hget(key, "userId")
  }
  const owners = await ownerLookup.exec<(string | number | null)[]>()

  const pipeline = redis.pipeline()
  chatKeys.forEach((key, index) => {
    if (isChatOwner(owners[index], userId)) {
      pipeline.del(key)
    }
    pipeline.zrem(`user:chat:${userId}`, key)
  })
  await pipeline.exec()

  updateTag("chat-list")
})
