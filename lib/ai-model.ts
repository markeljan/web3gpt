/**
 * The OpenAI model every agent runs on, and how hard it reasons.
 *
 * gpt-6.1-terra is OpenAI's mid tier of the GPT-6.1 generation (Luna < Terra < Sol
 * < Astra). It is a clear step up from gpt-6-luna, the previous default, for
 * writing and reviewing Solidity, at $1 / $5 per 1M input / output tokens: about
 * 10x Luna, but half the price of gpt-6.1-sol. Medium is Terra's default reasoning
 * effort and the setting OpenAI benchmarks it at; we pin it so a change in the
 * API default can't silently change cost or behaviour.
 *
 * Set `AI_MODEL` to run a different model without a code change, for example
 * `gpt-6-luna` to cut model cost by ~10x, or `gpt-6.1-sol` for the hardest
 * contracts at roughly twice Terra's cost.
 */
export const DEFAULT_AI_MODEL = "gpt-6.1-terra"

export const AI_REASONING_EFFORT = "medium"

export const getAiModel = (): string => process.env.AI_MODEL?.trim() || DEFAULT_AI_MODEL
