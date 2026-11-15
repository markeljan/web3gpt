import { APICallError, type LanguageModelMiddleware, RetryError, StreamProviderError } from "ai"
import { z } from "zod"

const quotaCodes = ["insufficient_quota", "project_spend_limit_exceeded"]
const errorDetails = z.object({ code: z.unknown().optional(), type: z.unknown().optional() })
const errorDataSchema = errorDetails.extend({
  error: errorDetails.optional(),
  response: z.object({ error: errorDetails }).optional(),
})

const knownQuotaCode = ({ code, type }: z.infer<typeof errorDetails>) =>
  quotaCodes.find((quota) => quota === code || quota === type)

function quotaCode(error: APICallError): string | undefined {
  const parsed = errorDataSchema.safeParse(error.data)
  if (!parsed.success) {
    return undefined
  }
  const { data } = parsed
  // OpenAI's HTTP errors, early SSE errors, and response.failed frames store the same codes differently.
  return knownQuotaCode(data.response?.error ?? data.error ?? data)
}

export function isModelQuotaError(error: unknown): boolean {
  const lastError = RetryError.isInstance(error) ? error.lastError : error
  return APICallError.isInstance(lastError)
    ? quotaCode(lastError) !== undefined
    : StreamProviderError.isInstance(lastError) && knownQuotaCode(lastError) !== undefined
}

/** OpenAI uses 429 for both temporary throttling and exhausted account quota. */
async function stopOnQuota<T>(run: () => PromiseLike<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (APICallError.isInstance(error)) {
      const code = quotaCode(error)
      if (code) {
        // biome-ignore lint/style/useErrorCause: the upstream error contains request and response contents
        throw new APICallError({
          data: { error: { code } },
          isRetryable: false,
          message: error.message,
          requestBodyValues: undefined,
          statusCode: error.statusCode,
          url: error.url,
        })
      }
    }
    throw error
  }
}

export const modelQuotaMiddleware: LanguageModelMiddleware = {
  wrapGenerate: ({ doGenerate }) => stopOnQuota(doGenerate),
  wrapStream: ({ doStream }) => stopOnQuota(doStream),
}
