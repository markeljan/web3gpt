import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test"
import solc from "solc"
import { BUNDLED_RELEASE, CompilerVersionError } from "@/lib/solidity/compiler-version"

mock.module("server-only", () => ({}))

const { getCompiler, getSolcReleases, resolveCompilerRelease } = await import("@/lib/solidity/solc-loader")

const LIST = {
  builds: [{ path: "soljson-v0.8.20+commit.a1b79de6.js", sha256: `0x${"00".repeat(32)}`, version: "0.8.20" }],
  releases: {
    "0.8.20": "soljson-v0.8.20+commit.a1b79de6.js",
    "0.8.29": "soljson-v0.8.29+commit.ab55807c.js",
  },
}

let now = 1_800_000_000_000
let requests: string[] = []
let respond: (url: string) => Response | Promise<Response> = () => new Response("down", { status: 503 })
const spies: { mockRestore: () => void }[] = []

beforeEach(() => {
  requests = []
  spies.push(
    spyOn(Date, "now").mockImplementation(() => now),
    spyOn(console, "warn").mockImplementation(() => undefined),
    spyOn(console, "error").mockImplementation(() => undefined),
    spyOn(globalThis, "fetch").mockImplementation(((input: string | URL | Request) => {
      const url = String(input)
      requests.push(url)
      return Promise.resolve(respond(url))
    }) as typeof fetch)
  )
})

afterEach(() => {
  for (const spy of spies.splice(0)) {
    spy.mockRestore()
  }
})

const sources = (pragma: string) => ({ "Main.sol": { content: `pragma solidity ${pragma};\ncontract C {}` } })

// These run in order: the loader keeps its caches in module state.
describe("solc loader", () => {
  test("the bundled compiler needs neither the release list nor a download", async () => {
    expect(await resolveCompilerRelease(sources("^0.8.0"))).toEqual(BUNDLED_RELEASE)
    expect(await getCompiler(BUNDLED_RELEASE)).toBe(solc)
    expect(requests).toEqual([])
  })

  test("an unreachable release list is retried after a minute, not on every request", async () => {
    respond = () => new Response("down", { status: 503 })
    expect(await getSolcReleases()).toBeNull()
    await expect(resolveCompilerRelease(sources("0.8.20"))).rejects.toThrow(
      "the list of compiler releases could not be fetched"
    )
    expect(requests).toEqual(["https://binaries.soliditylang.org/bin/list.json"])

    now += 61_000
    respond = () => Response.json(LIST)
    expect((await resolveCompilerRelease(sources("0.8.20"))).longVersion).toBe("v0.8.20+commit.a1b79de6")
    expect(requests).toHaveLength(2)
  })

  test("the release list is cached for an hour", async () => {
    await getSolcReleases()
    now += 59 * 60_000
    await getSolcReleases()
    expect(requests).toEqual([])

    now += 2 * 60_000
    respond = () => new Response("down", { status: 503 })
    // A failed refresh keeps serving the list we already have.
    expect((await getSolcReleases())?.map(({ version }) => version)).toEqual(["0.8.29", "0.8.20"])
    expect(requests).toHaveLength(1)
  })

  test("a download that doesn't match the published checksum is refused and not cached", async () => {
    const [, release] = (await getSolcReleases()) ?? []
    if (!release) {
      throw new Error("expected a 0.8.20 release")
    }
    respond = () => new Response("module.exports = {}")

    await expect(getCompiler(release)).rejects.toThrow(CompilerVersionError)
    await expect(getCompiler(release)).rejects.toThrow("does not match the published checksum")
    expect(requests).toEqual([
      "https://binaries.soliditylang.org/bin/soljson-v0.8.20+commit.a1b79de6.js",
      "https://binaries.soliditylang.org/bin/soljson-v0.8.20+commit.a1b79de6.js",
    ])
  })

  test("concurrent requests for one version share a single download", async () => {
    const release = {
      longVersion: "v0.8.19+commit.7dd6d404",
      path: "soljson-v0.8.19+commit.7dd6d404.js",
      version: "0.8.19",
    }
    respond = () => new Response("not found", { status: 404 })

    const results = await Promise.allSettled([getCompiler(release), getCompiler(release), getCompiler(release)])
    expect(results.map(({ status }) => status)).toEqual(["rejected", "rejected", "rejected"])
    expect(requests).toHaveLength(1)
  })
})
