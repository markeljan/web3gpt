import "server-only"
import { Redis } from "@upstash/redis"

/**
 * The shared Upstash Redis client (the store formerly provisioned as Vercel KV).
 *
 * Credentials come from the Upstash marketplace integration's variables when
 * both are set, and otherwise from the legacy Vercel KV names, so a deployment
 * works before and after its store is migrated. The two names are read as
 * pairs so a URL from one database is never combined with a token from another.
 */
const CREDENTIAL_PAIRS = [
  ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
  ["KV_REST_API_URL", "KV_REST_API_TOKEN"],
] as const

export const resolveRedisCredentials = (env: Record<string, string | undefined> = process.env) => {
  for (const [urlName, tokenName] of CREDENTIAL_PAIRS) {
    const url = env[urlName]
    const token = env[tokenName]
    if (url && token) {
      return { token, url }
    }
  }
  throw new Error(
    "Redis is not configured: set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN (or the legacy KV_REST_API_URL and KV_REST_API_TOKEN)"
  )
}

/**
 * Same options `@vercel/kv` passed to the Upstash client, so reads and writes
 * behave exactly as before. Automatic (de)serialization stays on (the Upstash
 * default): objects are JSON round-tripped, and numeric hash values such as
 * GitHub ids read back as numbers. `@vercel/kv` disabled telemetry by setting
 * `UPSTASH_DISABLE_TELEMETRY`; `enableTelemetry: false` does the same for this
 * client without touching `process.env`.
 */
export const createRedisClient = (env?: Record<string, string | undefined>) =>
  new Redis({
    ...resolveRedisCredentials(env),
    automaticDeserialization: true,
    // Next.js recommends no value or `default` for fetch's `cache`; Upstash defaults to `no-store`.
    cache: "default",
    enableAutoPipelining: true,
    enableTelemetry: false,
  })

let client: Redis | null = null

/**
 * Created on first use rather than at import, so modules that import it can be
 * loaded (by `next build`, or by tests) without credentials.
 */
export const redis = new Proxy({} as Redis, {
  get(_target, prop) {
    client ??= createRedisClient()
    return Reflect.get(client, prop)
  },
})
