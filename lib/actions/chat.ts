"use server"
import { updateTag } from "next/cache"
import { isChatOwner } from "@/lib/chat-ownership"
import { getChatOwnerId, withUser } from "@/lib/data/kv"
import { redis } from "@/lib/redis"

// Server actions are public HTTP endpoints: every argument is attacker-controlled
// and ownership has to be read from KV, never from the payload.

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
