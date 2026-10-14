import { describe, expect, test } from "bun:test"
import {
  getRetryDelayMs,
  MAX_VERIFICATION_ATTEMPTS,
  RETRY_MAX_DELAY_MS,
  selectVerifications,
  type VerificationQueueEntry,
} from "@/lib/solidity/verification-queue"

const NOW = 1_800_000_000_000
const MINUTE = 60_000

const entry = (deployHash: string, fields: Record<string, unknown> = {}): VerificationQueueEntry => ({
  data: {
    contractAddress: `0xc${deployHash}`,
    contractName: "Token",
    deployHash,
    encodedConstructorArgs: "",
    fileName: "Token.sol",
    queuedAt: NOW - 10 * MINUTE,
    standardJsonInput: { language: "Solidity" },
    verificationAttempts: 0,
    verificationGuid: "",
    verificationStatus: "queued",
    viemChain: { id: 80_002, name: "Polygon Amoy" },
    ...fields,
  },
  key: `verification:${deployHash}`,
})

const selectedHashes = (entries: VerificationQueueEntry[], limit?: number) =>
  selectVerifications(entries, NOW, { limit }).selected.map((record) => record.deployHash)

describe("verification queue selection", () => {
  test("prefers fresh deployments, then submission retries, then status polls", () => {
    const entries = [
      entry("0xpoll", {
        lastCheckedAt: NOW - 5 * MINUTE,
        verificationAttempts: 1,
        verificationGuid: "guid",
        verificationStatus: "submitted",
      }),
      entry("0xretry", { lastCheckedAt: NOW - 5 * MINUTE, verificationAttempts: 1, verificationStatus: "queued" }),
      entry("0xfresh"),
    ]

    expect(selectedHashes(entries)).toEqual(["0xfresh", "0xretry", "0xpoll"])
  })

  test("orders within a group by oldest activity, falling back to queuedAt", () => {
    const entries = [
      entry("0xnewer", { queuedAt: NOW - MINUTE }),
      entry("0xolder", { queuedAt: NOW - 30 * MINUTE }),
      entry("0xpolled-recently", {
        lastCheckedAt: NOW - 2 * MINUTE,
        queuedAt: NOW - 60 * MINUTE,
        verificationAttempts: 1,
        verificationGuid: "a",
      }),
      entry("0xpolled-long-ago", {
        lastCheckedAt: NOW - 20 * MINUTE,
        queuedAt: NOW - 30 * MINUTE,
        verificationAttempts: 1,
        verificationGuid: "b",
      }),
    ]

    expect(selectedHashes(entries)).toEqual(["0xolder", "0xnewer", "0xpolled-long-ago", "0xpolled-recently"])
  })

  test("caps a run at the limit and reports the rest as deferred", () => {
    const entries = Array.from({ length: 30 }, (_, index) =>
      entry(`0x${String(index).padStart(2, "0")}`, { queuedAt: NOW - index * MINUTE })
    )
    const selection = selectVerifications(entries, NOW, { limit: 25 })

    expect(selection.selected).toHaveLength(25)
    expect(selection.deferred).toBe(5)
    // Oldest first, so the five most recent deployments wait for the next run.
    expect(selection.selected[0]?.deployHash).toBe("0x29")
  })

  test("stuck records cannot starve a new deployment", () => {
    const stuck = Array.from({ length: 40 }, (_, index) =>
      entry(`0xstuck${index}`, {
        lastCheckedAt: NOW - 90 * MINUTE,
        lastVerificationError: "Invalid constructor arguments",
        verificationAttempts: 7,
        verificationStatus: "error",
      })
    )
    const selection = selectVerifications([...stuck, entry("0xnew", { queuedAt: NOW })], NOW, { limit: 25 })

    expect(selection.selected[0]?.deployHash).toBe("0xnew")
  })

  test("counts records by status", () => {
    const selection = selectVerifications(
      [
        entry("0xa"),
        entry("0xb", { verificationAttempts: 1, verificationGuid: "g", verificationStatus: "submitted" }),
        entry("0xc", { verificationAttempts: 2, verificationStatus: "error" }),
        entry("0xd", { verificationStatus: "weird" }),
        { data: { nope: true }, key: "verification:0xe" },
      ],
      NOW
    )

    expect(selection.total).toBe(5)
    expect(selection.byStatus).toEqual({ error: 1, malformed: 1, queued: 1, submitted: 1, unknown: 1 })
  })
})

describe("verification backoff", () => {
  test("grows exponentially with attempts and is capped at an hour", () => {
    expect(getRetryDelayMs(0)).toBe(0)
    expect(getRetryDelayMs(1)).toBe(MINUTE)
    expect(getRetryDelayMs(2)).toBe(2 * MINUTE)
    expect(getRetryDelayMs(4)).toBe(8 * MINUTE)
    expect(getRetryDelayMs(7)).toBe(RETRY_MAX_DELAY_MS)
    expect(getRetryDelayMs(50)).toBe(RETRY_MAX_DELAY_MS)
  })

  test("skips records still inside their backoff window", () => {
    const selection = selectVerifications(
      [
        entry("0xwaiting", { lastCheckedAt: NOW - 3 * MINUTE, verificationAttempts: 4 }),
        entry("0xdue", { lastCheckedAt: NOW - 9 * MINUTE, verificationAttempts: 4 }),
      ],
      NOW
    )

    expect(selection.selected.map((record) => record.deployHash)).toEqual(["0xdue"])
    expect(selection.backoff).toBe(1)
    expect(selection.deferred).toBe(0)
  })

  test("a record checked about a minute ago after one attempt is due on the next cron tick", () => {
    expect(selectedHashes([entry("0xa", { lastCheckedAt: NOW - 55_000, verificationAttempts: 1 })])).toEqual(["0xa"])
  })

  test("ignores timestamps in the future instead of backing off forever", () => {
    expect(
      selectedHashes([entry("0xa", { lastCheckedAt: NOW + 365 * 24 * 60 * MINUTE, verificationAttempts: 3 })])
    ).toEqual(["0xa"])
  })
})

describe("verification attempts cap", () => {
  test("marks records at the cap as terminal without selecting them", () => {
    const selection = selectVerifications(
      [
        entry("0xcapped", {
          lastCheckedAt: NOW - 2 * 60 * MINUTE,
          lastVerificationError: "Fail - Unable to verify",
          verificationAttempts: MAX_VERIFICATION_ATTEMPTS,
          verificationStatus: "error",
        }),
        entry("0xbelow", {
          lastCheckedAt: NOW - 2 * 60 * MINUTE,
          verificationAttempts: MAX_VERIFICATION_ATTEMPTS - 1,
        }),
      ],
      NOW
    )

    expect(selection.selected.map((record) => record.deployHash)).toEqual(["0xbelow"])
    expect(selection.terminal).toEqual([
      {
        error: `Gave up after ${MAX_VERIFICATION_ATTEMPTS} attempts: Fail - Unable to verify`,
        id: "0xcapped",
        key: "verification:0xcapped",
        reason: "max-attempts",
      },
    ])
  })

  test("applies the cap even while the record would still be in backoff", () => {
    const selection = selectVerifications(
      [entry("0xcapped", { lastCheckedAt: NOW - MINUTE, verificationAttempts: 400 })],
      NOW
    )

    expect(selection.terminal.map((record) => record.reason)).toEqual(["max-attempts"])
    expect(selection.backoff).toBe(0)
  })
})

describe("malformed verification records", () => {
  const malformed: [string, VerificationQueueEntry][] = [
    ["a non-object value", { data: "junk", key: "verification:0xa" }],
    ["an array", { data: [1, 2], key: "verification:0xa" }],
    ["a missing deployHash", entry("0xa", { deployHash: undefined })],
    ["a deployHash that does not match the key", { ...entry("0xa"), key: "verification:0xb" }],
    ["a missing contractAddress", entry("0xa", { contractAddress: "" })],
    ["a missing viemChain", entry("0xa", { viemChain: undefined })],
    ["a viemChain without an id", entry("0xa", { viemChain: { name: "Nowhere" } })],
    ["a non-numeric chain id", entry("0xa", { viemChain: { id: "137" } })],
    ["a missing standardJsonInput", entry("0xa", { standardJsonInput: undefined })],
    ["a missing contractName", entry("0xa", { contractName: undefined })],
  ]

  for (const [description, record] of malformed) {
    test(`treats ${description} as terminal`, () => {
      const selection = selectVerifications([record], NOW)

      expect(selection.selected).toHaveLength(0)
      expect(selection.terminal).toHaveLength(1)
      expect(selection.terminal[0]?.reason).toBe("malformed")
      expect(selection.terminal[0]?.key).toBe(record.key)
    })
  }

  test("uses the key suffix as the id so a record without a deployHash can still be retired", () => {
    const selection = selectVerifications([{ data: {}, key: "verification:0xorphan" }], NOW)

    expect(selection.terminal[0]?.id).toBe("0xorphan")
  })

  test("coerces junk counters instead of crashing", () => {
    const [record] = selectVerifications(
      [entry("0xa", { lastCheckedAt: "yesterday", verificationAttempts: "lots", verificationGuid: { not: "a guid" } })],
      NOW
    ).selected

    expect(record?.verificationAttempts).toBe(0)
    expect(record?.lastCheckedAt).toBeUndefined()
    expect(record?.verificationGuid).toBe("")
  })

  test("malformed records do not use up processing slots", () => {
    const junk = Array.from({ length: 30 }, (_, index) => ({ data: { spam: index }, key: `verification:junk${index}` }))
    const selection = selectVerifications([...junk, entry("0xreal")], NOW, { limit: 25 })

    expect(selection.selected.map((record) => record.deployHash)).toEqual(["0xreal"])
    expect(selection.terminal).toHaveLength(30)
  })
})

describe("compiler version on verification records", () => {
  test("new records carry their compiler version and records from before it existed still work", () => {
    const { selected, terminal } = selectVerifications(
      [
        entry("0xnew", { compilerVersion: "v0.8.24+commit.e11b9ed9" }),
        entry("0xold"),
        entry("0xjunk", { compilerVersion: 824 }),
      ],
      NOW
    )

    expect(terminal).toEqual([])
    const versions = Object.fromEntries(selected.map((record) => [record.deployHash, record.compilerVersion]))
    expect(versions).toEqual({ "0xjunk": undefined, "0xnew": "v0.8.24+commit.e11b9ed9", "0xold": undefined })
  })
})
