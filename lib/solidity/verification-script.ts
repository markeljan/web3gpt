import { deleteVerification, getVerifications, retireVerification, updateVerification } from "@/lib/data/kv"
import { checkVerifyStatus, verifyContract } from "@/lib/solidity/verification"
import {
  formatVerificationSummary,
  type QueuedVerification,
  selectVerifications,
  type VerificationRunSummary,
} from "@/lib/solidity/verification-queue"

const PASS_MESSAGE = "Pass - Verified"
const ALREADY_VERIFIED_MESSAGES = ["Smart-contract already verified.", "Contract source code already verified"]
// The explorer compiled the submission and it did not match the deployed code.
// Polling the same GUID again can't change that, so the record is retired.
const DEFINITIVE_FAILURE_MESSAGE = "Fail - Unable to verify"
const PENDING_MESSAGES = ["Pending in queue", "Already Queued", "In progress", "In queue"]
const RETRYABLE_SUBMISSION_ERRORS = [
  "Unable to locate ContractCode",
  "The address is not a smart contract",
  "Pending in queue",
]

const isAlreadyVerified = (value?: string) =>
  Boolean(value && ALREADY_VERIFIED_MESSAGES.some((message) => value.includes(message)))

const isDefinitiveFailure = (value?: string) => Boolean(value?.includes(DEFINITIVE_FAILURE_MESSAGE))

const isPending = (value?: string) => Boolean(value && PENDING_MESSAGES.some((message) => value.includes(message)))

const isRetryableSubmissionError = (value?: string) =>
  Boolean(value && RETRYABLE_SUBMISSION_ERRORS.some((message) => value.includes(message)))

// Bounds the KV work spent retiring records in one run, so a flood of junk
// records is drained over several runs instead of stalling a single one.
const TERMINAL_RETIRE_LIMIT = 100

type VerificationQueueItem = QueuedVerification

const setVerificationFailure = async (
  deployHash: string,
  verificationAttempts: number,
  verificationStatus: "queued" | "submitted" | "error",
  errorMessage: string
) => {
  await updateVerification(deployHash, {
    lastCheckedAt: Date.now(),
    lastVerificationError: errorMessage,
    verificationAttempts,
    verificationStatus,
  })
}

const submitVerification = async (verificationData: VerificationQueueItem) => {
  const verificationAttempts = verificationData.verificationAttempts + 1
  const submission = await verifyContract(verificationData)

  if (isAlreadyVerified(submission.result)) {
    await deleteVerification(verificationData.deployHash)
    return "verified" as const
  }

  if (submission.status === "1" && submission.message === "OK" && submission.result) {
    await updateVerification(verificationData.deployHash, {
      lastCheckedAt: Date.now(),
      lastVerificationError: "",
      submittedAt: verificationData.submittedAt || Date.now(),
      verificationAttempts,
      verificationGuid: submission.result,
      verificationStatus: "submitted",
    })
    return "submitted" as const
  }

  await setVerificationFailure(
    verificationData.deployHash,
    verificationAttempts,
    isRetryableSubmissionError(submission.result) ? "queued" : "error",
    submission.result || submission.message || "Unknown verification submission error"
  )

  return "failed" as const
}

const checkSubmittedVerification = async (verificationData: VerificationQueueItem) => {
  const verificationAttempts = verificationData.verificationAttempts + 1
  const verificationStatus = await checkVerifyStatus(
    verificationData.verificationGuid || "",
    verificationData.viemChain
  )

  if (verificationStatus.result === PASS_MESSAGE || isAlreadyVerified(verificationStatus.result)) {
    await deleteVerification(verificationData.deployHash)
    return "verified" as const
  }

  if (isPending(verificationStatus.result)) {
    await updateVerification(verificationData.deployHash, {
      lastCheckedAt: Date.now(),
      lastVerificationError: "",
      verificationAttempts,
      verificationStatus: "submitted",
    })
    return "pending" as const
  }

  if (isDefinitiveFailure(verificationStatus.result)) {
    await retireVerification(verificationData.deployHash, verificationStatus.result)
    return "retired" as const
  }

  await setVerificationFailure(
    verificationData.deployHash,
    verificationAttempts,
    "error",
    verificationStatus.result || verificationStatus.message || "Unknown verification status"
  )

  return "failed" as const
}

const retireTerminalVerifications = async (terminal: ReturnType<typeof selectVerifications>["terminal"]) => {
  const results = await Promise.allSettled(
    terminal.slice(0, TERMINAL_RETIRE_LIMIT).map(({ id, error }) => retireVerification(id, error))
  )
  const retired = results.filter((outcome) => outcome.status === "fulfilled").length
  return { retired, retireErrors: results.length - retired }
}

export async function processVerifications() {
  const { entries, unreadable } = await getVerifications()
  const selection = selectVerifications(entries, Date.now())
  const { retired, retireErrors } = await retireTerminalVerifications(selection.terminal)

  const result: VerificationRunSummary & { success: boolean; verificationCount: number } = {
    backoff: selection.backoff,
    byStatus: selection.byStatus,
    deferred: selection.deferred,
    failed: 0,
    pending: 0,
    processed: selection.selected.length,
    submitted: 0,
    success: true,
    terminal: retired,
    terminalErrors: retireErrors,
    total: selection.total,
    unreadable,
    verificationCount: selection.total,
    verified: 0,
  }

  for (const verificationData of selection.selected) {
    try {
      const status = verificationData.verificationGuid
        ? // biome-ignore lint/performance/noAwaitInLoops: explorers rate-limit per API key
          await checkSubmittedVerification(verificationData)
        : await submitVerification(verificationData)

      if (status === "verified") {
        result.verified += 1
      } else if (status === "submitted") {
        result.submitted += 1
      } else if (status === "pending") {
        result.pending += 1
      } else if (status === "retired") {
        result.failed += 1
        result.terminal += 1
      } else {
        result.failed += 1
      }
    } catch (error) {
      try {
        await setVerificationFailure(
          verificationData.deployHash,
          verificationData.verificationAttempts + 1,
          verificationData.verificationGuid ? "submitted" : "queued",
          error instanceof Error ? error.message : "Verification request failed"
        )
      } catch {
        // KV is unavailable too; the record is retried on a later run.
      }
      result.failed += 1
    }
  }

  // One line per run so queue health is visible in the cron logs. Warn when
  // the queue is not keeping up or records are being given up on.
  const summary = formatVerificationSummary(result)
  if (result.deferred > 0 || result.terminal > 0 || result.terminalErrors > 0 || result.unreadable > 0) {
    console.warn(summary)
  } else {
    console.info(summary)
  }

  return result
}
