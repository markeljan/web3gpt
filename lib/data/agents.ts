import "server-only"
import { AGENTS_ARRAY, DEFAULT_AGENT } from "@/lib/constants"
import { getAgent } from "@/lib/data/kv"
import { redis } from "@/lib/redis"
import type { Agent } from "@/lib/types"

const AGENT_CACHE_TTL = 3600 // 1 hour

/**
 * Get an agent by ID - checks built-in agents first, then KV for user-created agents
 */
export const getAgentById = async (agentId: string): Promise<Agent> => {
  // Check built-in agents first (no cache needed, they're in-memory)
  const builtInAgent = AGENTS_ARRAY.find((a) => a.id === agentId)
  if (builtInAgent) {
    return builtInAgent
  }

  // Check cache for user-created agents
  const cacheKey = `agent:cache:${agentId}`
  const cached = await redis.get<Agent>(cacheKey)
  if (cached) {
    return cached
  }

  // Check KV for user-created agents
  const kvAgent = await getAgent(agentId)
  if (kvAgent) {
    await redis.set(cacheKey, kvAgent, { ex: AGENT_CACHE_TTL })
    return kvAgent
  }

  // Fallback to default agent
  return DEFAULT_AGENT
}
