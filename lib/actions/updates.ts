"use server"
import { headers } from "next/headers"
import { getSession } from "@/lib/auth"
import { withUser } from "@/lib/data/kv"
import { getSuggestedEmail, isValidEmail, normalizeEmail } from "@/lib/email"
import { getClientIp, hitRateLimit, LIMITS } from "@/lib/rate-limit"
import { redis } from "@/lib/redis"

// Product-update (early access) mailing list.
//
// `emails:list` is the list itself: a set of normalized addresses, the same key
// the old landing form wrote to. For signed-in users, `user:details:<id>` also
// records `email_subscribed` and the address they used (`subscribed_email`), so
// the user menu can show the state and unsubscribe the right address.
//
// Server actions are public HTTP endpoints: every argument is attacker-controlled.

const EMAIL_LIST_KEY = "emails:list"

export type SubscribeResult = { ok: true; email: string } | { ok: false; error: string }

export type UpdatesSubscription = {
  subscribed: boolean
  /** The address on the list, when known. */
  email: string | null
  /** The account's own address, for prefilling the form. Never a GitHub noreply address. */
  suggestedEmail: string | null
}

const isTruthyFlag = (value: unknown) => value === true || value === "true" || value === 1 || value === "1"

export async function subscribeToUpdatesAction(email: unknown): Promise<SubscribeResult> {
  if (typeof email !== "string") {
    return { error: "Enter a valid email address.", ok: false }
  }
  const normalized = normalizeEmail(email)
  if (!isValidEmail(normalized)) {
    return { error: "Enter a valid email address.", ok: false }
  }

  const limit = await hitRateLimit(LIMITS.emailSubscribe, getClientIp(await headers()))
  if (!limit.ok) {
    return { error: "Too many attempts. Please try again in a few minutes.", ok: false }
  }

  try {
    await redis.sadd(EMAIL_LIST_KEY, normalized)

    const userId = (await getSession())?.user.id
    if (userId) {
      await redis.hset(`user:details:${userId}`, {
        email_subscribed: true,
        email_subscribed_at: Date.now(),
        subscribed_email: normalized,
      })
    }
  } catch (error) {
    console.error("failed to store subscription", error)
    return { error: "Something went wrong. Please try again.", ok: false }
  }

  return { email: normalized, ok: true }
}

export const getUpdatesSubscriptionAction = withUser<void, UpdatesSubscription>(async (_, userId) => {
  const details = await redis.hgetall<Record<string, unknown>>(`user:details:${userId}`)
  const subscribedEmail = typeof details?.subscribed_email === "string" ? details.subscribed_email : null
  return {
    email: subscribedEmail,
    subscribed: isTruthyFlag(details?.email_subscribed),
    suggestedEmail: getSuggestedEmail(details?.email),
  }
})

export const unsubscribeFromUpdatesAction = withUser<void, boolean>(async (_, userId) => {
  const key = `user:details:${userId}`
  const subscribedEmail = await redis.hget<string>(key, "subscribed_email")

  // Only the address this account subscribed is removed. Subscriptions from
  // before `subscribed_email` was recorded can't be traced to an address, so for
  // those only the flag is cleared.
  if (typeof subscribedEmail === "string") {
    await redis.srem(EMAIL_LIST_KEY, subscribedEmail)
  }
  await redis.hset(key, { email_subscribed: false })
  await redis.hdel(key, "subscribed_email", "email_subscribed_at")
  return true
})
