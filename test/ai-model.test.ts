import { afterEach, describe, expect, test } from "bun:test"
import { DEFAULT_AI_MODEL, getAiModel } from "@/lib/ai-model"

const original = process.env.AI_MODEL

afterEach(() => {
  if (original === undefined) {
    delete process.env.AI_MODEL
  } else {
    process.env.AI_MODEL = original
  }
})

describe("AI model selection", () => {
  test("defaults to gpt-6-luna, the replacement for the deprecated gpt-5.4-nano", () => {
    delete process.env.AI_MODEL
    expect(DEFAULT_AI_MODEL).toBe("gpt-6-luna")
    expect(getAiModel()).toBe("gpt-6-luna")
  })

  test("AI_MODEL overrides the default", () => {
    process.env.AI_MODEL = "gpt-6.1-sol"
    expect(getAiModel()).toBe("gpt-6.1-sol")
  })

  test("a blank AI_MODEL falls back to the default", () => {
    process.env.AI_MODEL = "   "
    expect(getAiModel()).toBe(DEFAULT_AI_MODEL)
  })
})
