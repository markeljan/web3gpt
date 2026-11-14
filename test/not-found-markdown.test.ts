import { describe, expect, test } from "bun:test"
import { readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { isUnknownPage, KNOWN_SEGMENTS, markdownNotFound } from "@/lib/not-found-markdown"

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
