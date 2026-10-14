import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test"
import type { VerificationQueueEntry } from "@/lib/solidity/verification-queue"

// processVerifications talks to KV and the explorers; both are replaced with
// in-memory fakes so the cron loop can be exercised without credentials.
const store = new Map<string, Record<string, unknown>>()
const retired: { id: string; error: string }[] = []
let unreadable = 0
let explorerCalls: string[] = []

mock.module("@/lib/data/kv", () => ({
  deleteVerification: (deployHash: string) => {
    store.delete(`verification:${deployHash}`)
    return Promise.resolve()
  },
  getVerifications: () =>
    Promise.resolve({
      entries: [...store.entries()].map(([key, data]): VerificationQueueEntry => ({ data, key })),
      unreadable,
    }),
  retireVerification: (id: string, error: string) => {
    store.delete(`verification:${id}`)
    retired.push({ error, id })
    return Promise.resolve()
  },
  updateVerification: (deployHash: string, data: Record<string, unknown>) => {
    const key = `verification:${deployHash}`
    store.set(key, { ...store.get(key), ...data })
    return Promise.resolve()
  },
}))

mock.module("@/lib/solidity/verification", () => ({
  checkVerifyStatus: (guid: string) => {
    explorerCalls.push(`check:${guid}`)
    return Promise.resolve({ message: "OK", result: "Pending in queue", status: "0" })
  },
  verifyContract: ({ deployHash }: { deployHash: string }) => {
    explorerCalls.push(`submit:${deployHash}`)
    if (deployHash === "0xthrows") {
      return Promise.reject(new Error("No explorer API key configured for Nowhere (1)"))
    }
    return Promise.resolve({ message: "OK", result: `guid-${deployHash}`, status: "1" })
  },
}))

const { processVerifications } = await import("@/lib/solidity/verification-script")

const NOW = 1_800_000_000_000

const seed = (deployHash: string, fields: Record<string, unknown> = {}) => {
  store.set(`verification:${deployHash}`, {
    contractAddress: "0xc0",
    contractName: "Token",
    deployHash,
    encodedConstructorArgs: "",
    fileName: "Token.sol",
    queuedAt: NOW - 60_000,
    standardJsonInput: "{}",
    verificationAttempts: 0,
    verificationGuid: "",
    verificationStatus: "queued",
    viemChain: { id: 80_002, name: "Polygon Amoy" },
    ...fields,
  })
}

let now = NOW

describe("processVerifications", () => {
  const spies: { mockRestore: () => void }[] = []

  beforeEach(() => {
    store.clear()
    retired.length = 0
    unreadable = 0
    explorerCalls = []
    now = NOW
    spies.push(spyOn(Date, "now").mockImplementation(() => now))
  })

  afterEach(() => {
    for (const spy of spies.splice(0)) {
      spy.mockRestore()
    }
  })

  test("retires capped and malformed records, skips backoff, and processes the rest", async () => {
    const info = spyOn(console, "info").mockImplementation(() => undefined)
    const warn = spyOn(console, "warn").mockImplementation(() => undefined)

    seed("0xfresh")
    seed("0xpolling", {
      lastCheckedAt: NOW - 120_000,
      verificationAttempts: 1,
      verificationGuid: "g1",
      verificationStatus: "submitted",
    })
    seed("0xwaiting", { lastCheckedAt: NOW - 60_000, verificationAttempts: 5, verificationStatus: "error" })
    seed("0xcapped", { lastVerificationError: "bad args", verificationAttempts: 10, verificationStatus: "error" })
    store.set("verification:0xjunk", { hello: "world" })
    unreadable = 1

    const result = await processVerifications()

    expect(explorerCalls).toEqual(["submit:0xfresh", "check:g1"])
    expect(retired.map(({ id }) => id).sort()).toEqual(["0xcapped", "0xjunk"])
    expect(result).toMatchObject({
      backoff: 1,
      byStatus: { error: 2, malformed: 1, queued: 1, submitted: 1 },
      deferred: 0,
      pending: 1,
      processed: 2,
      submitted: 1,
      success: true,
      terminal: 2,
      terminalErrors: 0,
      total: 5,
      unreadable: 1,
    })
    expect(store.get("verification:0xfresh")).toMatchObject({
      verificationAttempts: 1,
      verificationGuid: "guid-0xfresh",
      verificationStatus: "submitted",
    })

    expect(info).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]?.[0])).toContain("[verification-queue] total=5")

    info.mockRestore()
    warn.mockRestore()
  })

  test("a record that keeps throwing is backed off and eventually retired", async () => {
    const info = spyOn(console, "info").mockImplementation(() => undefined)
    const warn = spyOn(console, "warn").mockImplementation(() => undefined)
    seed("0xthrows")

    let submissions = 0
    // Simulate a day of minute-by-minute cron runs.
    for (let run = 0; run < 24 * 60 && store.has("verification:0xthrows"); run += 1) {
      const before = explorerCalls.length
      // biome-ignore lint/performance/noAwaitInLoops: each simulated cron run depends on the previous one
      await processVerifications()
      submissions += explorerCalls.length - before
      now += 60_000
    }

    expect(submissions).toBe(10)
    expect(store.has("verification:0xthrows")).toBe(false)
    expect(retired).toHaveLength(1)
    expect(retired[0]?.error).toContain("Gave up after 10 attempts: No explorer API key configured")

    info.mockRestore()
    warn.mockRestore()
  })
})
