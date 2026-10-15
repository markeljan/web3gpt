// Pure helpers shared by the browser form and the server action, so both sides
// agree on what a valid address is.

export const MAX_EMAIL_LENGTH = 254
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const GITHUB_NOREPLY_SUFFIX = "@users.noreply.github.com"

export const normalizeEmail = (email: string): string => email.trim().toLowerCase()

/** Expects a normalized address. */
export const isValidEmail = (email: string): boolean => email.length <= MAX_EMAIL_LENGTH && EMAIL_PATTERN.test(email)

/**
 * GitHub's private-email placeholder (see `mapProfileToUser` in lib/auth.ts).
 * Mail to it goes nowhere, so it is never offered as a default.
 */
export const isGithubNoreplyEmail = (email: string): boolean => normalizeEmail(email).endsWith(GITHUB_NOREPLY_SUFFIX)

/** The signed-in user's address if it is real enough to prefill a form with. */
export const getSuggestedEmail = (email: unknown): string | null => {
  if (typeof email !== "string") {
    return null
  }
  const normalized = normalizeEmail(email)
  return isValidEmail(normalized) && !isGithubNoreplyEmail(normalized) ? normalized : null
}
