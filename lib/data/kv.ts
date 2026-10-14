import "server-only"
import { kv } from "@vercel/kv"
import { getSession } from "@/lib/auth"
import { isChatOwner } from "@/lib/chat-ownership"
import type {
  Agent,
  DbChat,
  DbChatListItem,
  DeploymentRecord,
  SkillChat,
  VerifyContractParams,
  WalletDeployArtifact,
} from "@/lib/types"

type ActionWithUser<T, R> = (data: T, userId: string) => Promise<R>
const WALLET_DEPLOY_ARTIFACT_TTL_SECONDS = 60 * 60

export const withUser =
  <T, R>(action: ActionWithUser<T, R>) =>
  async (data: T): Promise<R | undefined> => {
    const session = await getSession()
    const userId = session?.user?.id
    if (!userId) {
      return
    }

    return action(data, userId)
  }

export async function storeUser(user: { id: string } & Record<string, unknown>) {
  const userKey = `user:details:${user.id}`
  // KV rejects undefined values, and the auth profile has optional fields.
  const details = Object.fromEntries(Object.entries(user).filter(([, value]) => value !== undefined))

  await kv.hmset(userKey, details)

  await kv.sadd("users:list", user.id)
}

// Read live rather than through `unstable_cache`.
//
// This was cached for an hour behind a global "chat-list" tag, but the write
// that matters happens in `storeChat`, which runs from the /api/chat route
// handler. `revalidateTag` there never produced a fresh read — verified
// against both the "default" cacheLife profile and `{ expire: 0 }`, neither of
// which re-executed the cached function on subsequent requests — so a new chat
// never showed up in the sidebar until the TTL lapsed. The tag was global too,
// so one user's write would drop every other user's entry anyway.
//
// The cost of serving it live is a zrange plus one pipelined hmget, and the
// root layout is already `force-dynamic`, so it re-renders per request either
// way.
export async function getChatList(userId?: string): Promise<DbChatListItem[]> {
  const resolvedUserId = userId ?? (await getSession())?.user?.id
  if (!resolvedUserId) {
    return []
  }

  const chats: string[] = await kv.zrange(`user:chat:${resolvedUserId}`, 0, -1, { rev: true })
  if (!chats.length) {
    return []
  }

  const pipeline = kv.pipeline()
  for (const chat of chats) {
    pipeline.hmget<DbChatListItem>(chat, "id", "title", "published", "createdAt", "avatarUrl", "userId")
  }

  return await pipeline.exec<DbChatListItem[]>()
}

/** The stored owner of a chat, normalized to a string, or null if the chat does not exist. */
export const getChatOwnerId = async (id: string): Promise<string | null> => {
  const owner = await kv.hget<string | number>(`chat:${id}`, "userId")
  return owner === null || owner === undefined ? null : String(owner)
}

/** A chat owned by the signed-in user. Any other user's chat reads as missing. */
export const getChat = withUser<string, DbChat | null>(async (id, userId) => {
  const chat = await kv.hgetall<DbChat>(`chat:${id}`)
  if (!(chat && isChatOwner(chat.userId, userId))) {
    return null
  }
  return chat
})

/**
 * A chat its owner has published, or null. Unpublished chats must not leak any
 * field, the title included: it is the opening of the first prompt.
 */
export async function getPublishedChat(id: string): Promise<DbChat | null> {
  const chat = await kv.hgetall<DbChat>(`chat:${id}`)
  if (!chat?.published) {
    return null
  }
  return chat
}

export const getSkillChat = async (id: string): Promise<SkillChat | null> =>
  await kv.hgetall<SkillChat>(`skill-chat:${id}`)

export async function storeSkillChat(chat: SkillChat) {
  await kv.hmset(`skill-chat:${chat.id}`, chat)
}

export const getAgent = async (id: string): Promise<Agent | null> => await kv.hgetall<Agent>(`agent:${id}`)

export const getAllAgents = async (): Promise<Agent[]> => {
  const agentIds = await kv.smembers<string[]>("agents:list")

  if (!agentIds || agentIds.length === 0) {
    return []
  }

  const pipeline = kv.pipeline()
  for (const agentId of agentIds) {
    pipeline.hgetall<Agent>(`agent:${agentId}`)
  }

  const results = await pipeline.exec<Agent[]>()
  return results.filter(Boolean)
}

/**
 * Store agent directly without auth check (for internal use like tool execution)
 */
export const storeAgentDirect = async (agent: Agent): Promise<void> => {
  await Promise.all([kv.hmset(`agent:${agent.id}`, agent), kv.sadd("agents:list", agent.id)])
}

// verifications

// Live jobs live under `verification:` and are scanned every minute by the
// cron. Jobs that can never verify are moved under a prefix the scan does not
// match, so they stop costing anything but remain inspectable until they expire.
const VERIFICATION_KEY_PREFIX = "verification:"
const VERIFICATION_TERMINAL_KEY_PREFIX = "verification-failed:"
const VERIFICATION_TERMINAL_TTL_SECONDS = 7 * 24 * 60 * 60

export type VerificationScanResult = {
  entries: { key: string; data: unknown }[]
  unreadable: number
}

/**
 * Returns every live `verification:*` hash together with its key. Values are
 * returned untyped because anything can end up in KV; the cron validates them.
 * A key that cannot be read as a hash is counted, not thrown, so one bad key
 * cannot stop the whole queue.
 */
export const getVerifications = async (): Promise<VerificationScanResult> => {
  const entries: VerificationScanResult["entries"] = []
  let unreadable = 0
  const BATCH_SIZE = 100 // Process 100 keys at a time
  let cursor = 0

  do {
    // Use SCAN instead of KEYS to avoid blocking
    const [nextCursor, keys] = await kv.scan(cursor, {
      count: BATCH_SIZE,
      match: `${VERIFICATION_KEY_PREFIX}*`,
    })

    cursor = Number.parseInt(nextCursor, 10)

    if (keys && keys.length > 0) {
      // Process in batches to avoid "too many keys" error
      const pipeline = kv.pipeline()
      for (const key of keys) {
        pipeline.hgetall(key)
      }
      const batchResults = await pipeline.exec({ keepErrors: true })
      batchResults.forEach(({ error, result }, index) => {
        if (error) {
          unreadable += 1
        } else if (result) {
          entries.push({ data: result, key: keys[index] })
        }
      })
    }
  } while (cursor !== 0)

  return { entries, unreadable }
}

/** Marks a verification as terminal and moves it out of the scanned keyspace for a week. */
export const retireVerification = async (id: string, lastVerificationError: string) => {
  const key = `${VERIFICATION_KEY_PREFIX}${id}`
  const terminalKey = `${VERIFICATION_TERMINAL_KEY_PREFIX}${id}`

  await kv
    .multi()
    .hset(key, { failedAt: Date.now(), lastVerificationError, verificationStatus: "failed" })
    .rename(key, terminalKey)
    .expire(terminalKey, VERIFICATION_TERMINAL_TTL_SECONDS)
    .exec()
}

export const deleteVerification = async (deployHash: string) => {
  await kv.del(`verification:${deployHash}`)
}

export const storeVerification = async (data: VerifyContractParams) => {
  await kv.hmset(`verification:${data.deployHash}`, {
    ...data,
    lastVerificationError: data.lastVerificationError || "",
    queuedAt: data.queuedAt || Date.now(),
    verificationAttempts: data.verificationAttempts || 0,
    verificationGuid: data.verificationGuid || "",
    verificationStatus: data.verificationStatus || "queued",
  })
}

export const updateVerification = async (deployHash: string, data: Partial<VerifyContractParams>) => {
  await kv.hmset(`verification:${deployHash}`, data)
}

export const storeDeployment = async (data: DeploymentRecord, userId = "anon") => {
  await Promise.all([
    kv.hmset(`deployment:${data.cid}`, data),
    kv.zadd(`user:deployments:${userId}`, {
      member: `deployment:${data.cid}`,
      score: Date.now(),
    }),
  ])
}

export const storeWalletDeployArtifact = async (artifactId: string, artifact: WalletDeployArtifact) => {
  await kv.set(`wallet-deploy:${artifactId}`, artifact, {
    ex: WALLET_DEPLOY_ARTIFACT_TTL_SECONDS,
  })
}

export const getWalletDeployArtifact = async (artifactId: string) =>
  await kv.get<WalletDeployArtifact>(`wallet-deploy:${artifactId}`)

export const deleteWalletDeployArtifact = async (artifactId: string) => {
  await kv.del(`wallet-deploy:${artifactId}`)
}

export const storeAgent = withUser<Agent, void>(async (agent, userId) => {
  if (userId !== agent.userId) {
    return
  }
  await Promise.all([kv.hmset(`agent:${agent.id}`, agent), kv.sadd("agents:list", agent.id)])
})

/**
 * Writes a chat for the signed-in user. Returns false, writing nothing, when the
 * caller is not who the record claims or when the chat id already belongs to
 * someone else. Chat ids come from the client, and published ones are public, so
 * the stored owner is the only thing that can be trusted.
 */
export const storeChat = withUser<
  {
    data: DbChat
    userId: string
  },
  boolean
>(async ({ data, userId }, authenticatedUserId) => {
  if (authenticatedUserId !== userId || authenticatedUserId !== String(data.userId)) {
    return false
  }

  // Claim the id atomically if it is new; otherwise it must already be ours.
  const claimed = await kv.hsetnx(`chat:${data.id}`, "userId", userId)
  if (!claimed && (await getChatOwnerId(data.id)) !== userId) {
    return false
  }

  // Callers rebuild the whole record on every assistant turn and stamp a fresh
  // createdAt, so the value already in KV is the only surviving record of when
  // the chat actually started. Keep the first one and track activity separately.
  const storedCreatedAt = await kv.hget<number>(`chat:${data.id}`, "createdAt")
  const updatedAt = Date.now()

  const payload: DbChat = {
    ...data,
    createdAt: typeof storedCreatedAt === "number" ? storedCreatedAt : data.createdAt,
    updatedAt,
    userId,
  }

  await Promise.all([
    kv.hmset(`chat:${data.id}`, payload),
    // The sidebar reads this index newest-first, so it stays scored by activity.
    kv.zadd(`user:chat:${userId}`, {
      member: `chat:${data.id}`,
      score: updatedAt,
    }),
  ])

  return true
})

export const getUserDeployments = withUser<void, DeploymentRecord[]>(async (_, userId) => {
  const deploymentKeys = await kv.zrange<string[]>(`user:deployments:${userId}`, 0, -1, { rev: true })

  if (!deploymentKeys.length) {
    return []
  }

  const pipeline = kv.pipeline()
  for (const deploymentKey of deploymentKeys) {
    const fullKey = deploymentKey.startsWith("deployment:") ? deploymentKey : `deployment:${deploymentKey}`
    pipeline.hgetall<DeploymentRecord>(fullKey)
  }

  const results = await pipeline.exec<DeploymentRecord[]>()

  return results.filter(Boolean)
})

export const getAllDeployments = async () => {
  const deployments: DeploymentRecord[] = []
  const BATCH_SIZE = 10_000 // Process up to 10000 keys at a time
  let cursor = 0

  // Use SCAN instead of KEYS to avoid blocking
  do {
    const [nextCursor, keys] = await kv.scan(cursor, {
      count: BATCH_SIZE,
      match: "deployment:*",
    })

    cursor = Number.parseInt(nextCursor, 10)

    if (keys && keys.length > 0) {
      const pipeline = kv.pipeline()
      for (const key of keys) {
        pipeline.hgetall<DeploymentRecord>(key)
      }
      const batchResults = await pipeline.exec<DeploymentRecord[]>()
      deployments.push(...batchResults.filter(Boolean))
    }
  } while (cursor !== 0)

  return deployments
}
