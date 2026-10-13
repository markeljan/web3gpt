import type { UIMessage } from "ai"
import { type NextRequest, NextResponse } from "next/server"
import { streamAgentReply } from "@/lib/agent-chat"
import { getSession } from "@/lib/auth"
import { canWriteChat } from "@/lib/chat-ownership"
import { buildChatTitle, createTextMessage, getResponseText } from "@/lib/chat-utils"
import { getChatOwnerId, storeChat } from "@/lib/data/kv"
import { getCallerId } from "@/lib/deploy-limits"
import { getClientIp, hitRateLimit, LIMITS, rateLimitHeaders } from "@/lib/rate-limit"
import type { DbChat } from "@/lib/types"

export const maxDuration = 60

/** Clients resend the whole conversation each turn; this bounds a single request. */
const MAX_BODY_BYTES = 1_000_000

type ChatRequestBody = {
  messages: UIMessage[]
  chatId?: string
  agentId: string
}

const parseBody = (raw: string): ChatRequestBody | null => {
  try {
    const body = JSON.parse(raw) as Partial<ChatRequestBody> | null
    if (!(body && Array.isArray(body.messages) && typeof body.agentId === "string" && body.agentId)) {
      return null
    }
    if (body.chatId !== undefined && typeof body.chatId !== "string") {
      return null
    }
    return body as ChatRequestBody
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  const { id: userId, image: avatarUrl } = session?.user || {}
  const ip = getClientIp(request.headers)

  // Every turn spends model tokens and may drive the server wallet, so limit
  // before doing any work: per user when signed in, per IP otherwise.
  const limit = userId ? await hitRateLimit(LIMITS.chatUser, userId) : await hitRateLimit(LIMITS.chatAnonymous, ip)
  if (!limit.ok) {
    return NextResponse.json(
      { error: userId ? "Too many requests. Please slow down." : "Too many requests. Sign in for a higher limit." },
      { headers: rateLimitHeaders(limit), status: 429 }
    )
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0)
  if (declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Conversation is too large" }, { status: 413 })
  }
  const raw = await request.text()
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Conversation is too large" }, { status: 413 })
  }

  const body = parseBody(raw)
  if (!body) {
    return NextResponse.json({ error: "messages and agentId are required" }, { status: 400 })
  }
  const { messages, chatId, agentId } = body

  // Chat ids are chosen by the client and published ones are public. Refuse to
  // continue someone else's chat up front, before any tokens are spent;
  // `storeChat` enforces the same rule again at write time.
  if (userId && chatId && !canWriteChat(await getChatOwnerId(chatId), userId)) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 })
  }

  const { result } = await streamAgentReply({
    agentId,
    callerId: getCallerId({ ip, userId }),
    messages,
    onFinish: async ({ response }) => {
      // Store chat after completion if user is logged in
      if (userId && chatId) {
        const assistantText = getResponseText({
          responseMessages: response.messages,
        })
        const responseMessages: UIMessage[] = assistantText ? [createTextMessage("assistant", assistantText)] : []
        const allMessages = [...messages, ...responseMessages]

        const chat: DbChat = {
          agentId,
          avatarUrl,
          // Only used when this is the chat's first write; `storeChat` keeps the
          // original createdAt for chats that already exist.
          createdAt: Date.now(),
          id: chatId,
          messages: allMessages,
          published: false,
          title: buildChatTitle(allMessages),
          userId,
        }

        await storeChat({ data: chat, userId })
      }
    },
    userId,
  })

  return result.toUIMessageStreamResponse({
    sendReasoning: true,
  })
}
