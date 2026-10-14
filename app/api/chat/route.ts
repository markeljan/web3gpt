import { consumeStream, createUIMessageStreamResponse, generateId, type UIMessage } from "ai"
import { type NextRequest, NextResponse } from "next/server"
import { streamAgentReply } from "@/lib/agent-chat"
import { getSession } from "@/lib/auth"
import { canWriteChat } from "@/lib/chat-ownership"
import { buildChatTitle } from "@/lib/chat-utils"
import { getChatOwnerId, storeChat } from "@/lib/data/kv"
import { getCallerId } from "@/lib/deploy-limits"
import { getClientIp, hitRateLimit, LIMITS, rateLimitHeaders } from "@/lib/rate-limit"
import type { DbChat } from "@/lib/types"

// A deployment turn chains up to five model steps, a solc compile with remote
// imports, a transaction, up to 45s waiting for its receipt, and an IPFS
// upload. At 60s the function could be killed after the transaction was sent,
// leaving a paid-for contract with no record. This matches vercel.json.
export const maxDuration = 300

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
    userId,
  })

  const uiStream = result.toUIMessageStream({
    generateMessageId: generateId,
    // Persistence mode: `onFinish` receives the exact UIMessages the client
    // rendered, including tool calls and results (the deployment card with its
    // address, tx hash and explorer links) and reasoning. Collapsing the reply
    // to plain text used to drop all of that from the stored chat.
    onFinish: async ({ messages: finalMessages }) => {
      if (!(userId && chatId)) {
        return
      }

      const chat: DbChat = {
        agentId,
        avatarUrl,
        // Only used when this is the chat's first write; `storeChat` keeps the
        // original createdAt for chats that already exist.
        createdAt: Date.now(),
        id: chatId,
        messages: finalMessages,
        published: false,
        title: buildChatTitle(finalMessages),
        userId,
      }

      await storeChat({ data: chat, userId })
    },
    originalMessages: messages,
    sendReasoning: true,
  })

  // One branch goes to the client; the server drains the other to the end. If
  // the client disconnects mid-turn (a closed tab during a deployment), its
  // branch is cancelled but the model, the tools and `onFinish` still run to
  // completion, so a deployed contract is never missing from the stored chat.
  const [clientStream, persistenceStream] = uiStream.tee()
  consumeStream({
    onError: (error) => console.error("chat persistence stream failed", error),
    stream: persistenceStream,
  })

  return createUIMessageStreamResponse({ stream: clientStream })
}
