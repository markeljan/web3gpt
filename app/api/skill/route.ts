import { generateId } from "ai"
import { type NextRequest, NextResponse } from "next/server"
import { generateAgentReply } from "@/lib/agent-chat"
import {
  buildChatTitle,
  createTextMessage,
  getLatestAssistantText,
  getResponseText,
  toHistoryItems,
} from "@/lib/chat-utils"
import { DEFAULT_AGENT_ID } from "@/lib/constants"
import { getAgentById } from "@/lib/data/agents"
import { getSkillChat, storeSkillChat } from "@/lib/data/kv"
import { getCallerId } from "@/lib/deploy-limits"
import { getClientIp, hitRateLimits, LIMITS, RATE_LIMIT_HEADER_NAMES, rateLimitHeaders } from "@/lib/rate-limit"
import type { SkillChat } from "@/lib/types"

// See app/api/chat/route.ts: a deployment turn can take well over a minute.
export const maxDuration = 300

const CORS_HEADERS = {
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Expose-Headers": RATE_LIMIT_HEADER_NAMES.join(", "),
}

/** Roughly a large contract plus instructions; longer prompts are refused. */
const MAX_MESSAGE_CHARS = 50_000
const CHAT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/u

type SkillRequest = {
  agentId?: string
  chatId?: string
  message?: string
  prompt?: string
  history?: boolean
  full?: boolean
}

const parseBoolean = (value: boolean | string | null | undefined): boolean => {
  if (typeof value === "boolean") {
    return value
  }

  return value === "true" || value === "1"
}

class InvalidBodyError extends Error {}

/** Reads the POST body. An empty body is allowed (it starts a chat); anything else must be a JSON object. */
const readBody = async (request: NextRequest): Promise<SkillRequest> => {
  if (request.method !== "POST") {
    return {}
  }

  const text = await request.text()
  if (!text.trim()) {
    return {}
  }

  let body: unknown
  try {
    body = JSON.parse(text)
  } catch (error) {
    throw new InvalidBodyError("Request body must be valid JSON", { cause: error })
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new InvalidBodyError("Request body must be a JSON object")
  }

  return body as SkillRequest
}

const getRequestPayload = async (request: NextRequest): Promise<SkillRequest> => {
  const body = await readBody(request)
  const { searchParams } = request.nextUrl

  return {
    agentId: body.agentId || searchParams.get("agentId") || undefined,
    chatId: body.chatId || searchParams.get("chatId") || undefined,
    full: parseBoolean(body.full) || parseBoolean(searchParams.get("full")),
    history: parseBoolean(body.history) || parseBoolean(searchParams.get("history")) || parseBoolean(body.full),
    message: body.message || body.prompt || searchParams.get("message") || searchParams.get("prompt") || undefined,
  }
}

const json = (body: unknown, init?: ResponseInit) => {
  const headers = new Headers(CORS_HEADERS)

  if (init?.headers) {
    const initHeaders = new Headers(init.headers)
    for (const [key, value] of initHeaders.entries()) {
      headers.set(key, value)
    }
  }

  return NextResponse.json(body, {
    ...init,
    headers,
  })
}

async function handleSkillRequest(request: NextRequest) {
  let payload: SkillRequest
  try {
    payload = await getRequestPayload(request)
  } catch (error) {
    if (error instanceof InvalidBodyError) {
      return json({ code: "invalid_body", error: error.message }, { status: 400 })
    }
    throw error
  }
  const includeHistory = payload.full || payload.history
  const requestedAgentId = payload.agentId || DEFAULT_AGENT_ID
  const message = payload.message?.trim()
  const ip = getClientIp(request.headers)

  if (payload.chatId && !CHAT_ID_PATTERN.test(payload.chatId)) {
    return json(
      { code: "invalid_chat_id", error: "chatId must be 1-64 characters of A-Z, a-z, 0-9, _ or -" },
      { status: 400 }
    )
  }
  const chatId = payload.chatId || generateId()

  if (message && message.length > MAX_MESSAGE_CHARS) {
    return json(
      { chatId, code: "message_too_long", error: `message must be at most ${MAX_MESSAGE_CHARS} characters` },
      { status: 413 }
    )
  }

  // This endpoint is public and unauthenticated. Turns that call the model are
  // limited per IP and per chat; plain reads get a looser per-IP limit.
  const limit = message
    ? await hitRateLimits([
        { id: ip, rule: LIMITS.skillMessage },
        { id: chatId, rule: LIMITS.skillMessagePerChat },
      ])
    : await hitRateLimits([{ id: ip, rule: LIMITS.skillRead }])
  if (!limit.ok) {
    return json(
      {
        chatId,
        code: "rate_limited",
        error: "Too many requests. Please slow down.",
        retryAfterSeconds: limit.resetSeconds,
      },
      { headers: rateLimitHeaders(limit), status: 429 }
    )
  }
  // Every response from here on reports the remaining quota.
  const headers = rateLimitHeaders(limit)

  const existingChat = await getSkillChat(chatId)

  // An existing chat keeps its agent. A new chat may name one, but an unknown id
  // must not silently fall back to the default agent.
  if (!existingChat && payload.agentId && (await getAgentById(payload.agentId)).id !== payload.agentId) {
    return json({ chatId, code: "agent_not_found", error: `No agent with id "${payload.agentId}"` }, { status: 404 })
  }

  const activeAgentId = existingChat?.agentId || requestedAgentId
  const session: SkillChat = existingChat || {
    agentId: activeAgentId,
    createdAt: Date.now(),
    id: chatId,
    messages: [],
    title: "Skill Chat",
  }

  if (!message) {
    if (!existingChat) {
      await storeSkillChat(session)
    }

    return json(
      {
        agentId: activeAgentId,
        chatId,
        history: includeHistory ? toHistoryItems(session.messages) : undefined,
        response: getLatestAssistantText(session.messages),
      },
      { headers }
    )
  }

  try {
    const userMessage = createTextMessage("user", message)
    const messages = [...session.messages, userMessage]
    const { result } = await generateAgentReply({
      agentId: activeAgentId,
      callerId: getCallerId({ ip }),
      messages,
    })

    // AI SDK 7: `responseMessages` accumulates every step (what
    // `response.messages` meant in v6; it is now the final step's only), and the
    // top-level `toolResults` now spans every step, so read the final step's.
    const assistantText = getResponseText({
      responseMessages: result.responseMessages,
      text: result.text,
      toolResults: result.finalStep.toolResults,
    })
    const nextMessages = assistantText ? [...messages, createTextMessage("assistant", assistantText)] : messages

    await storeSkillChat({
      ...session,
      agentId: activeAgentId,
      messages: nextMessages,
      title: buildChatTitle(nextMessages, "Skill Chat"),
    })

    return json(
      {
        agentId: activeAgentId,
        chatId,
        history: includeHistory ? toHistoryItems(nextMessages) : undefined,
        response: assistantText || null,
      },
      { headers }
    )
  } catch (error) {
    // Log the detail server-side; provider and RPC errors can carry internals.
    console.error("skill request failed", { chatId, error })
    return json(
      {
        agentId: activeAgentId,
        chatId,
        code: "internal_error",
        error: "Failed to complete skill request",
      },
      { headers, status: 500 }
    )
  }
}

export function GET(request: NextRequest) {
  return handleSkillRequest(request)
}

export function POST(request: NextRequest) {
  return handleSkillRequest(request)
}

export function OPTIONS() {
  return new NextResponse(null, {
    headers: CORS_HEADERS,
    status: 200,
  })
}
