import type { VerifyContractParams } from "@/lib/types"

// Pure selection logic for the verification cron. Nothing in here touches KV
// or the explorer APIs, so it can be unit tested with plain objects.

export const VERIFICATION_KEY_PREFIX = "verification:"
export const VERIFICATION_LIMIT = 25
export const MAX_VERIFICATION_ATTEMPTS = 10
export const RETRY_BASE_DELAY_MS = 60_000
export const RETRY_MAX_DELAY_MS = 60 * 60_000
// The cron fires roughly every minute, and lastCheckedAt is written a little
// after the run started. Without some slack a one-minute delay would always
// be missed by a few seconds and turn into two minutes.
export const CRON_JITTER_MS = 15_000

export type VerificationQueueEntry = {
  key: string
  data: unknown
}

export type QueuedVerification = VerifyContractParams & {
  verificationAttempts: number
  verificationGuid: string
}

export type TerminalReason = "malformed" | "max-attempts"

export type TerminalVerification = {
  id: string
  key: string
  reason: TerminalReason
  error: string
}

export type VerificationSelection = {
  selected: QueuedVerification[]
  terminal: TerminalVerification[]
  backoff: number
  deferred: number
  total: number
  byStatus: Record<string, number>
}

type SelectOptions = {
  limit?: number
  maxAttempts?: number
}

const KNOWN_STATUSES = new Set(["queued", "submitted", "verified", "error", "failed"])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.length > 0

const toAttemptCount = (value: unknown) => {
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0
}

// A timestamp in the future would hold a record in backoff indefinitely, so
// only accept values that are plausible relative to `now`.
const toTimestamp = (value: unknown, now: number) => {
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) && parsed > 0 && parsed <= now ? parsed : undefined
}

const toGuid = (value: unknown) => {
  if (typeof value === "string") {
    return value
  }
  // KV deserialises JSON-looking values, so an all-digit guid would come back as a number.
  return typeof value === "number" && Number.isFinite(value) ? String(value) : ""
}

const getMalformedReason = (id: string, data: unknown) => {
  if (!isRecord(data)) {
    return "record is not an object"
  }
  if (!(isNonEmptyString(data.deployHash) && data.deployHash === id)) {
    return "deployHash is missing or does not match the key"
  }
  if (!isNonEmptyString(data.contractAddress)) {
    return "contractAddress is missing"
  }
  if (!(isRecord(data.viemChain) && Number.isInteger(data.viemChain.id) && Number(data.viemChain.id) > 0)) {
    return "viemChain.id is missing"
  }
  if (data.standardJsonInput === undefined || data.standardJsonInput === null || data.standardJsonInput === "") {
    return "standardJsonInput is missing"
  }
  if (!(isNonEmptyString(data.fileName) && isNonEmptyString(data.contractName))) {
    return "fileName or contractName is missing"
  }
  return null
}

export type ParsedVerification =
  | { ok: true; record: QueuedVerification }
  | { ok: false; id: string; error: string; status: string }

export const parseVerificationEntry = ({ key, data }: VerificationQueueEntry, now: number): ParsedVerification => {
  const id = key.startsWith(VERIFICATION_KEY_PREFIX) ? key.slice(VERIFICATION_KEY_PREFIX.length) : key
  const malformedReason = getMalformedReason(id, data)

  if (malformedReason || !isRecord(data)) {
    return { error: `Malformed verification record: ${malformedReason}`, id, ok: false, status: "malformed" }
  }

  const record = data as unknown as VerifyContractParams
  return {
    ok: true,
    record: {
      ...record,
      encodedConstructorArgs: typeof data.encodedConstructorArgs === "string" ? data.encodedConstructorArgs : "",
      lastCheckedAt: toTimestamp(data.lastCheckedAt, now),
      queuedAt: toTimestamp(data.queuedAt, now),
      submittedAt: toTimestamp(data.submittedAt, now),
      verificationAttempts: toAttemptCount(data.verificationAttempts),
      verificationGuid: toGuid(data.verificationGuid),
    },
  }
}

/** How long to wait after the last explorer call before trying again. */
export const getRetryDelayMs = (attempts: number) => {
  if (attempts <= 0) {
    return 0
  }
  return Math.min(RETRY_BASE_DELAY_MS * 2 ** (attempts - 1), RETRY_MAX_DELAY_MS)
}

export const isDueForRetry = (record: QueuedVerification, now: number) => {
  if (record.verificationAttempts === 0 || record.lastCheckedAt === undefined) {
    return true
  }
  return now - record.lastCheckedAt + CRON_JITTER_MS >= getRetryDelayMs(record.verificationAttempts)
}

// Lower rank is processed first: fresh deployments, then submissions that
// need retrying, then explorer status polls for already-submitted jobs.
const getPriorityRank = (record: QueuedVerification) => {
  if (record.verificationGuid) {
    return 2
  }
  return record.verificationAttempts === 0 ? 0 : 1
}

const getLastActivity = (record: QueuedVerification) => record.lastCheckedAt ?? record.queuedAt ?? 0

const compareByPriority = (a: QueuedVerification, b: QueuedVerification) =>
  getPriorityRank(a) - getPriorityRank(b) ||
  getLastActivity(a) - getLastActivity(b) ||
  a.deployHash.localeCompare(b.deployHash)

/**
 * Decide what one cron run should do with the queue: which records to send to
 * the explorer (at most `limit`, by priority), which to retire as terminal,
 * and how many are waiting out a backoff or did not fit in this run.
 */
export const selectVerifications = (
  entries: VerificationQueueEntry[],
  now: number,
  { limit = VERIFICATION_LIMIT, maxAttempts = MAX_VERIFICATION_ATTEMPTS }: SelectOptions = {}
): VerificationSelection => {
  const byStatus: Record<string, number> = {}
  const terminal: TerminalVerification[] = []
  const due: QueuedVerification[] = []
  let backoff = 0

  for (const entry of entries) {
    const parsed = parseVerificationEntry(entry, now)

    if (!parsed.ok) {
      byStatus[parsed.status] = (byStatus[parsed.status] || 0) + 1
      terminal.push({ error: parsed.error, id: parsed.id, key: entry.key, reason: "malformed" })
      continue
    }

    const { record } = parsed
    const status =
      record.verificationStatus && KNOWN_STATUSES.has(record.verificationStatus) ? record.verificationStatus : "unknown"
    byStatus[status] = (byStatus[status] || 0) + 1

    if (record.verificationAttempts >= maxAttempts) {
      terminal.push({
        error: `Gave up after ${record.verificationAttempts} attempts: ${record.lastVerificationError || "no error recorded"}`,
        id: record.deployHash,
        key: entry.key,
        reason: "max-attempts",
      })
    } else if (isDueForRetry(record, now)) {
      due.push(record)
    } else {
      backoff += 1
    }
  }

  due.sort(compareByPriority)
  const selected = due.slice(0, limit)

  return {
    backoff,
    byStatus,
    deferred: due.length - selected.length,
    selected,
    terminal,
    total: entries.length,
  }
}

export type VerificationRunSummary = {
  total: number
  byStatus: Record<string, number>
  processed: number
  verified: number
  submitted: number
  pending: number
  failed: number
  backoff: number
  deferred: number
  terminal: number
  terminalErrors: number
  unreadable: number
}

export const formatVerificationSummary = (summary: VerificationRunSummary) => {
  const statuses = Object.entries(summary.byStatus)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([status, count]) => `${status}=${count}`)
    .join(",")

  return [
    "[verification-queue]",
    `total=${summary.total}`,
    `statuses=${statuses || "none"}`,
    `processed=${summary.processed}`,
    `verified=${summary.verified}`,
    `submitted=${summary.submitted}`,
    `pending=${summary.pending}`,
    `failed=${summary.failed}`,
    `backoff=${summary.backoff}`,
    `deferred=${summary.deferred}`,
    `terminal=${summary.terminal}`,
    `terminalErrors=${summary.terminalErrors}`,
    `unreadable=${summary.unreadable}`,
  ].join(" ")
}
