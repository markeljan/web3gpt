/**
 * The OpenAI model every agent runs on.
 *
 * gpt-5.4-nano, the previous default, was deprecated on 2026-10-01 and is removed
 * from the API on 2027-04-01. OpenAI names gpt-6-luna as its replacement: a newer
 * generation at half the price ($0.10 / $0.50 per 1M tokens), and still cheap
 * enough to put behind public, unauthenticated endpoints.
 *
 * Set `AI_MODEL` to run a different model without a code change, for example
 * `gpt-6.1-sol` for stronger Solidity at roughly 20x the cost.
 */
export const DEFAULT_AI_MODEL = "gpt-6-luna"

export const getAiModel = (): string => process.env.AI_MODEL?.trim() || DEFAULT_AI_MODEL
