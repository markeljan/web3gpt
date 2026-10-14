/**
 * Ownership rules for stored chats.
 *
 * Every chat hash carries the GitHub numeric id of its owner in `userId`.
 * The Redis client (`@/lib/redis`) deserializes hash values, so a purely
 * numeric id written as a string comes back as a number. Both sides are
 * normalized to strings before comparing.
 */
export const normalizeOwnerId = (value: unknown): string | null => {
  if (typeof value === "string" && value.length > 0) {
    return value
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value)
  }
  return null
}

/** True only when the stored owner is known and is exactly `userId`. */
export const isChatOwner = (storedOwnerId: unknown, userId: string | null | undefined): boolean => {
  if (!userId) {
    return false
  }
  return normalizeOwnerId(storedOwnerId) === userId
}

/**
 * Whether `userId` may write to a chat whose stored owner is `storedOwnerId`.
 * A chat with no owner yet (it does not exist) may be claimed by anyone signed
 * in; an existing chat may only be written by its owner.
 */
export const canWriteChat = (storedOwnerId: unknown, userId: string | null | undefined): boolean => {
  if (!userId) {
    return false
  }
  const owner = normalizeOwnerId(storedOwnerId)
  return owner === null || owner === userId
}
