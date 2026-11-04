import { describe, expect, test } from "bun:test"
import { prefersMarkdown } from "@/lib/accept"

describe("prefersMarkdown", () => {
  test("browsers get HTML", () => {
    expect(prefersMarkdown("text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")).toBe(false)
    expect(prefersMarkdown("*/*")).toBe(false)
    expect(prefersMarkdown(null)).toBe(false)
  })

  test("agents that ask for markdown get it", () => {
    expect(prefersMarkdown("text/markdown")).toBe(true)
    expect(prefersMarkdown("text/markdown, text/html;q=0.9")).toBe(true)
    expect(prefersMarkdown("text/html;q=0.5, TEXT/MARKDOWN")).toBe(true)
  })

  test("HTML wins when the client prefers it", () => {
    expect(prefersMarkdown("text/html, text/markdown;q=0.5")).toBe(false)
    expect(prefersMarkdown("text/markdown;q=0")).toBe(false)
  })
})
