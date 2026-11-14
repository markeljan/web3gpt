import { afterEach, expect, mock, spyOn, test } from "bun:test"

const ready = mock((): Promise<void> => Promise.resolve())
mock.module("@farcaster/miniapp-sdk", () => ({ sdk: { actions: { ready } } }))
mock.module("react", () => ({ useEffect: (callback: () => void) => callback() }))

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window")
const { MiniAppInitializer } = await import("@/components/miniapp-initializer")

function setWindow(host: "standalone" | "iframe" | "webview") {
  const browser: { parent?: object; ReactNativeWebView?: object } = {}
  browser.parent = host === "iframe" ? {} : browser
  if (host === "webview") {
    browser.ReactNativeWebView = {}
  }
  Object.defineProperty(globalThis, "window", { configurable: true, value: browser })
}

afterEach(() => {
  if (originalWindow) {
    Object.defineProperty(globalThis, "window", originalWindow)
  } else {
    Reflect.deleteProperty(globalThis, "window")
  }
  ready.mockClear()
})

test("standalone navigation does not send a readiness request", () => {
  setWindow("standalone")
  expect(MiniAppInitializer()).toBeNull()
  expect(ready).not.toHaveBeenCalled()
})

test.each(["iframe", "webview"] as const)("notifies an embedded %s host", (host) => {
  setWindow(host)
  expect(MiniAppInitializer()).toBeNull()
  expect(ready).toHaveBeenCalledTimes(1)
})

test("handles a host rejection without disclosing its details", async () => {
  setWindow("iframe")
  ready.mockRejectedValueOnce(new Error("synthetic host detail"))
  const warn = spyOn(console, "warn").mockImplementation(() => undefined)
  try {
    expect(MiniAppInitializer()).toBeNull()
    await Promise.resolve()
    expect(warn.mock.calls).toEqual([["Farcaster host readiness could not be confirmed"]])
  } finally {
    warn.mockRestore()
  }
})
