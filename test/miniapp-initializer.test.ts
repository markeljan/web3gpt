import { expect, test } from "bun:test"
import { spawnSync } from "node:child_process"

test("the readiness effect reports a rejected host call without an unhandled rejection", () => {
  // Isolate the React effect stub from the rest of the test suite.
  const result = spawnSync(
    process.execPath,
    [
      "--no-env-file",
      "-e",
      `
        import { mock } from "bun:test"
        import assert from "node:assert/strict"

        const failure = new Error("private host details")
        const ready = mock(() => Promise.reject(failure))
        mock.module("@farcaster/miniapp-sdk", () => ({ sdk: { actions: { ready } } }))
        mock.module("react", () => ({ useEffect: (callback) => callback() }))
        const { MiniAppInitializer } = await import("@/components/miniapp-initializer")
        const warnings = []
        console.warn = (...args) => warnings.push(args)
        assert.equal(MiniAppInitializer(), null)
        await new Promise(resolve => setImmediate(resolve))
        assert.equal(ready.mock.calls.length, 1)
        assert.deepEqual(warnings, [["Farcaster host readiness could not be confirmed"]])
      `,
    ],
    { encoding: "utf8", timeout: 5000 }
  )

  expect(result.status, result.stderr).toBe(0)
})
