import type { UIMessage } from "ai"
import { type NextRequest, NextResponse } from "next/server"
import { streamAgentReply } from "@/lib/agent-chat"
import { getSession } from "@/lib/auth"
import { canWriteChat } from "@/lib/chat-ownership"
import { buildChatTitle, createTextMessage, getResponseText } from "@/lib/chat-utils"
import { getChatOwnerId, storeChat } from "@/lib/data/kv"
import type { DbChat } from "@/lib/types"

export const maxDuration = 60

export async function POST(request: NextRequest) {
  const session = await getSession()
  const { id: userId, image: avatarUrl } = session?.user || {}

  const { messages, chatId, agentId } = (await request.json()) as {
    messages: UIMessage[]
    chatId?: string
    agentId: string
  }

  if (!agentId) {
    return NextResponse.json({ error: "Agent ID is required" }, { status: 400 })
  }

  // Chat ids are chosen by the client and published ones are public. Refuse to
  // continue someone else's chat up front, before any tokens are spent;
  // `storeChat` enforces the same rule again at write time.
  if (userId && chatId && !canWriteChat(await getChatOwnerId(chatId), userId)) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 })
  }

  const { result } = await streamAgentReply({
    agentId,
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
