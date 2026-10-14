import "server-only"
import { getChainById } from "@/lib/config"
import { hitRateLimit, LIMITS, type RateLimitResult } from "@/lib/rate-limit"

export type DeployAllowance = { ok: true } | { ok: false; reason: string }

type HitFn = typeof hitRateLimit

const formatWait = (seconds: number) => {
  if (seconds >= 3600) {
    return `${Math.ceil(seconds / 3600)} hour(s)`
  }
  return `${Math.max(1, Math.ceil(seconds / 60))} minute(s)`
}

/**
 * Mainnet means anything viem does not flag as a testnet, so a chain that is
 * added later without the flag gets the strict limits by default.
 */
export const isMainnetChain = (chainId: number): boolean => getChainById(chainId)?.testnet !== true

/**
 * Decides whether the server wallet may deploy for this caller. It counts the
 * attempt as it checks, so a deployment that fails afterwards still uses its
 * slot. That errs toward protecting the wallet.
 *
 * Mainnet limits fail closed: if KV can't be reached, mainnet deployments are
 * refused rather than left unmetered. Testnet limits fail open.
 */
export async function checkDeployAllowance(
  { chainId, callerId }: { chainId: number; callerId: string },
  hit: HitFn = hitRateLimit
): Promise<DeployAllowance> {
  if (isMainnetChain(chainId)) {
    const perCaller: RateLimitResult = await hit(LIMITS.deployMainnetPerCaller, callerId, { failOpen: false })
    if (!perCaller.ok) {
      return {
        ok: false,
        reason: `Mainnet deployment limit reached for this caller (${perCaller.limit} per day). Try again in ${formatWait(perCaller.resetSeconds)}, or deploy to a testnet, or use "Deploy with wallet" to deploy from your own wallet.`,
      }
    }

    const global: RateLimitResult = await hit(LIMITS.deployMainnetGlobal, "all", { failOpen: false })
    if (!global.ok) {
      return {
        ok: false,
        reason: `Web3GPT's shared daily budget for mainnet deployments is used up. Try again in ${formatWait(global.resetSeconds)}, or deploy to a testnet, or use "Deploy with wallet" to deploy from your own wallet.`,
      }
    }

    return { ok: true }
  }

  const testnet = await hit(LIMITS.deployTestnetPerCaller, callerId, { failOpen: true })
  if (!testnet.ok) {
    return {
      ok: false,
      reason: `Testnet deployment limit reached (${testnet.limit} per hour). Try again in ${formatWait(testnet.resetSeconds)}.`,
    }
  }
  return { ok: true }
}

/** Identifies who is deploying: the user if signed in, otherwise their IP. */
export const getCallerId = ({ userId, ip }: { userId?: string | null; ip?: string | null }) =>
  userId ? `user:${userId}` : `ip:${ip || "unknown"}`
