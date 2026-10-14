import "server-only"
import { redis } from "@/lib/redis"

/**
 * Fixed-window rate limiting on the existing Upstash Redis store (formerly Vercel KV).
 *
 * Each window is one counter key, `ratelimit:<bucket>:<id>:<window index>`, which
 * expires with the window. That costs one INCR per check (plus one EXPIRE when a
 * window opens), and needs no extra dependency or infrastructure.
 */

export type RateLimitRule = {
  /** Groups counters, e.g. "chat" or "deploy:mainnet". */
  bucket: string
  limit: number
  windowSeconds: number
}

export type RateLimitResult = {
  ok: boolean
  limit: number
  remaining: number
  /** Seconds until the current window resets. */
  resetSeconds: number
}

type CounterStore = {
  incr: (key: string) => Promise<number>
  expire: (key: string, seconds: number) => Promise<unknown>
}

export const getWindow = (nowMs: number, windowSeconds: number) => {
  const windowMs = windowSeconds * 1000
  const index = Math.floor(nowMs / windowMs)
  const resetSeconds = Math.max(1, Math.ceil(((index + 1) * windowMs - nowMs) / 1000))
  return { index, resetSeconds }
}

export const rateLimitKey = (rule: RateLimitRule, id: string, windowIndex: number) =>
  `ratelimit:${rule.bucket}:${id}:${windowIndex}`

/**
 * Counts one hit against `rule` for `id`.
 *
 * `failOpen` decides what happens when KV is unreachable: true lets the request
 * through (right for ordinary traffic, where an outage should not take the app
 * down), false refuses it (right for anything that spends real money).
 */
export async function hitRateLimit(
  rule: RateLimitRule,
  id: string,
  {
    failOpen = true,
    now = Date.now(),
    store = redis as CounterStore,
  }: { failOpen?: boolean; now?: number; store?: CounterStore } = {}
): Promise<RateLimitResult> {
  const { index, resetSeconds } = getWindow(now, rule.windowSeconds)
  const key = rateLimitKey(rule, id, index)

  try {
    const count = await store.incr(key)
    if (count === 1) {
      // Slightly longer than the window, so a counter never outlives its usefulness
      // by much and never expires before the window closes.
      await store.expire(key, rule.windowSeconds + 60)
    }
    return {
      limit: rule.limit,
      ok: count <= rule.limit,
      remaining: Math.max(0, rule.limit - count),
      resetSeconds,
    }
  } catch (error) {
    console.error(`rate limit check failed for ${rule.bucket}`, error)
    return { limit: rule.limit, ok: failOpen, remaining: failOpen ? rule.limit : 0, resetSeconds }
  }
}

/** Checks several rules in order and stops at the first one that is exceeded. */
export async function hitRateLimits(
  checks: { rule: RateLimitRule; id: string }[],
  options?: Parameters<typeof hitRateLimit>[2]
): Promise<RateLimitResult & { bucket?: string }> {
  let last: RateLimitResult = { limit: 0, ok: true, remaining: 0, resetSeconds: 0 }
  for (const { rule, id } of checks) {
    // Sequential on purpose: a request refused by an earlier rule must not use up
    // the later ones.
    // biome-ignore lint/performance/noAwaitInLoops: order matters, see above
    last = await hitRateLimit(rule, id, options)
    if (!last.ok) {
      return { ...last, bucket: rule.bucket }
    }
  }
  return last
}

/**
 * The caller's IP. On Vercel, `x-vercel-forwarded-for` and `x-real-ip` are set by
 * the platform and can't be spoofed by the client; `x-forwarded-for` comes last
 * because a client can prepend values to it.
 */
export const getClientIp = (headers: Headers): string => {
  const vercel = headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim()
  const realIp = headers.get("x-real-ip")?.trim()
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  return vercel || realIp || forwarded || "unknown"
}

export const rateLimitHeaders = (result: RateLimitResult): Record<string, string> => ({
  "Retry-After": String(result.resetSeconds),
  "X-RateLimit-Limit": String(result.limit),
  "X-RateLimit-Remaining": String(result.remaining),
})

// ---------------------------------------------------------------------------
// Limits. Request limits guard the OpenAI bill and server CPU; deployment limits
// guard the deployer wallet, which pays gas for every agent deployment.
// ---------------------------------------------------------------------------

const envInt = (name: string, fallback: number) => {
  const value = Number.parseInt(process.env[name] ?? "", 10)
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

const TEN_MINUTES = 600
const ONE_HOUR = 3600
const ONE_DAY = 86_400

export const LIMITS = {
  /** Anonymous chat turns per IP. */
  chatAnonymous: { bucket: "chat:anon", limit: envInt("RATE_LIMIT_CHAT_ANON", 20), windowSeconds: TEN_MINUTES },
  /** Signed-in chat turns per user. */
  chatUser: { bucket: "chat:user", limit: envInt("RATE_LIMIT_CHAT_USER", 60), windowSeconds: TEN_MINUTES },
  /** Contract compiles for wallet deployments, per IP. */
  compile: { bucket: "compile", limit: envInt("RATE_LIMIT_COMPILE", 20), windowSeconds: TEN_MINUTES },
  /** Polygon mainnet deployments by the server wallet, across all callers, per day. */
  deployMainnetGlobal: {
    bucket: "deploy:mainnet:global",
    limit: envInt("MAINNET_DEPLOY_DAILY_LIMIT", 25),
    windowSeconds: ONE_DAY,
  },
  /** Polygon mainnet deployments by the server wallet, per caller, per day. */
  deployMainnetPerCaller: {
    bucket: "deploy:mainnet",
    limit: envInt("MAINNET_DEPLOY_DAILY_LIMIT_PER_CALLER", 2),
    windowSeconds: ONE_DAY,
  },
  /** Testnet deployments by the server wallet, per caller, per hour. */
  deployTestnetPerCaller: {
    bucket: "deploy:testnet",
    limit: envInt("TESTNET_DEPLOY_HOURLY_LIMIT_PER_CALLER", 10),
    windowSeconds: ONE_HOUR,
  },
  /** Recording wallet deployments, per IP. */
  finalize: { bucket: "finalize", limit: envInt("RATE_LIMIT_FINALIZE", 20), windowSeconds: TEN_MINUTES },
  /** Skill turns that call the model, per IP and per chat. */
  skillMessage: { bucket: "skill:msg", limit: envInt("RATE_LIMIT_SKILL", 20), windowSeconds: TEN_MINUTES },
  skillMessagePerChat: { bucket: "skill:chat", limit: envInt("RATE_LIMIT_SKILL_CHAT", 30), windowSeconds: TEN_MINUTES },
  /** Skill reads (start chat, fetch history), per IP. */
  skillRead: { bucket: "skill:read", limit: envInt("RATE_LIMIT_SKILL_READ", 120), windowSeconds: TEN_MINUTES },
} satisfies Record<string, RateLimitRule>
