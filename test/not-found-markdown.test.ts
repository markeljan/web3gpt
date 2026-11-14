import { describe, expect, test } from "bun:test"
import { readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { isRewrite, unstable_doesMiddlewareMatch } from "next/experimental/testing/server"
import { NextRequest } from "next/server"
import { isUnknownPage, KNOWN_SEGMENTS, markdownNotFound } from "@/lib/not-found-markdown"
import nextConfig from "@/next.config"
import { config, proxy } from "@/proxy"

describe("markdownNotFound", () => {
  test("is a markdown 404 that links onward", async () => {
    const response = markdownNotFound("/nope")
    expect(response.status).toBe(404)
    expect(response.headers.get("content-type")).toContain("text/markdown")
    expect(response.headers.get("vary")).toBe("Accept")
    const body = await response.text()
    expect(body).toContain("/nope")
    expect(body).toContain("/llms.txt")
  })

  test("cannot inject markdown through the path", async () => {
    const body = await markdownNotFound("/a`\n# injected").text()
    expect(body).not.toContain("\n# injected")
  })
})

test.each([
  ["GET", "text/markdown", true],
  ["HEAD", "text/markdown", true],
  ["POST", "text/markdown", false],
  ["OPTIONS", "text/markdown", false],
  ["GET", "text/html", false],
])("unknown %s request with Accept: %s follows negotiation rules", (method, accept, expected) => {
  const request = new NextRequest("https://w3gpt.ai/missing", { headers: { accept }, method })
  expect(isRewrite(proxy(request))).toBe(expected)
})

describe("isUnknownPage", () => {
  test("known and unknown paths", () => {
    expect(isUnknownPage("/about")).toBe(false)
    expect(isUnknownPage("/chat/abc")).toBe(false)
    expect(isUnknownPage("/nope")).toBe(true)
    expect(isUnknownPage("/nope/deeper")).toBe(true)
    expect(isUnknownPage("/")).toBe(false)
  })

  test("every top-level page in app/ is listed as known", () => {
    const appDir = join(import.meta.dir, "..", "app")
    const pages = readdirSync(appDir).filter(
      (name) =>
        !(name.startsWith("[") || name === "api") &&
        statSync(join(appDir, name)).isDirectory() &&
        readdirSync(join(appDir, name)).some((file) => file.startsWith("page.") || file.startsWith("route."))
    )
    for (const page of pages) {
      expect(KNOWN_SEGMENTS.has(page)).toBe(true)
    }
  })
})

const missingPaths = [
  "/about/missing",
  "/privacy/missing",
  "/chat/id/missing",
  "/share/id/missing",
  "/chat",
  "/share",
  "/api-docs/missing",
  "/contact/deeper",
  "/contracts/deeper",
]

test.each(missingPaths)("unsupported route shape %s negotiates a 404", (path) => {
  expect(isUnknownPage(path)).toBe(true)
  for (const method of ["GET", "HEAD", "POST", "OPTIONS"]) {
    for (const accept of ["text/markdown", "text/html"]) {
      const response = proxy(new NextRequest(`https://w3gpt.ai${path}`, { headers: { accept }, method }))
      const rewritten = (method === "GET" || method === "HEAD") && accept === "text/markdown"
      expect(isRewrite(response)).toBe(rewritten)
      if (rewritten) {
        expect(response.headers.get("x-middleware-rewrite")).toBe("https://w3gpt.ai/api/not-found")
        expect(response.headers.get("vary")).toBe("Accept")
      }
    }
  }
})

test.each(["/about", "/privacy", "/contact", "/contracts", "/api-docs", "/chat/id", "/share/id"])(
  "supported route %s passes through",
  (path) => {
    expect(isUnknownPage(path)).toBe(false)
    expect(isRewrite(proxy(new NextRequest(`https://w3gpt.ai${path}`, { headers: { accept: "text/markdown" } })))).toBe(
      false
    )
  }
)

test.each(["/skill.md", "/llms.txt", "/about/file.png", "/api/chat", "/_next/static/chunk.js"])(
  "matcher excludes %s",
  (url) => {
    expect(unstable_doesMiddlewareMatch({ config, nextConfig, url })).toBe(false)
  }
)

test.each(missingPaths)("matcher includes %s", (url) => {
  expect(unstable_doesMiddlewareMatch({ config, nextConfig, url })).toBe(true)
})

test("dynamic routes and docs rewrite remain supported", async () => {
  for (const route of ["chat", "share"]) {
    expect(statSync(join(import.meta.dir, "..", "app", route, "[id]", "page.tsx")).isFile()).toBe(true)
    expect(isUnknownPage(`/${route}/fixture`)).toBe(false)
    expect(isUnknownPage(`/${route}/fixture/deeper`)).toBe(true)
  }
  expect(await nextConfig.rewrites?.()).toContainEqual({ destination: "/api/api-docs", source: "/api-docs" })
})
