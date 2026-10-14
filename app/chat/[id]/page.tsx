import { notFound, redirect } from "next/navigation"
import { Chat } from "@/components/chat/chat"
import { getSession } from "@/lib/auth"
import { toUIMessages } from "@/lib/chat-utils"
import { DEFAULT_AGENT } from "@/lib/constants"
import { getAgentById } from "@/lib/data/agents"
import { getChat } from "@/lib/data/kv"
import type { NextPageProps } from "@/lib/types"

export default async function ChatPage({ params, searchParams }: NextPageProps) {
  const session = await getSession()
  const { id } = await params
  const searchParamsResolved = await searchParams

  if (!session?.user.id) {
    // There is no /sign-in route; sign-in happens from the header. Sending an
    // unauthenticated reader to one produced a 404.
    redirect("/")
  }

  const chat = await getChat(id)

  if (!chat) {
    redirect("/")
  }

  if (String(chat?.userId) !== session?.user.id) {
    notFound()
  }

  const agentId = chat.agentId || searchParamsResolved?.a
  if (typeof agentId !== "string") {
    notFound()
  }

  const agent = await getAgentById(agentId)

  const messages = toUIMessages(chat.messages || [])

  return (
    <Chat
      // biome-ignore lint/suspicious/noUnnecessaryConditions: getAgentById can return a KV value, which is untyped at runtime; keep the fallback
      agent={agent || DEFAULT_AGENT}
      avatarUrl={session.user.image}
      initialChatId={chat.id}
      initialMessages={messages}
      key={chat.id}
      userId={session.user.id}
    />
  )
}
