import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { AgentCard } from "@/components/agent-card"
import { ChatList } from "@/components/chat/chat-list"
import { Landing } from "@/components/landing"
import { getSession } from "@/lib/auth"
import { APP_URL } from "@/lib/config"
import { getAgentById } from "@/lib/data/agents"
import { getPublishedChat } from "@/lib/data/kv"
import type { NextPageProps } from "@/lib/types"
import { formatDate } from "@/lib/utils"

export async function generateMetadata({ params }: NextPageProps): Promise<Metadata> {
  const { id } = await params
  const metadata: Metadata = {
    description: "Deploy smart contracts, create AI Agents, do more onchain with AI.",
    openGraph: {
      images: [`${APP_URL}/api/og?id=${id}&h=630`],
      url: `${APP_URL}/share/${id}`,
    },
    title: "Shared Chat",
    twitter: {
      card: "summary_large_image",
      images: [`${APP_URL}/api/og?id=${id}&h=675`],
      site: "@w3gptai",
    },
  }
  return metadata
}

export default async function SharePage({ params, searchParams }: NextPageProps) {
  const { id } = await params
  const searchParamsResolved = await searchParams
  const [session, chat] = await Promise.all([getSession(), getPublishedChat(id)])
  const userId = session?.user.id

  if (!chat?.published) {
    notFound()
  }
  const { title, avatarUrl, agentId = searchParamsResolved?.a, createdAt = new Date() } = chat

  const agent = typeof agentId === "string" ? await getAgentById(agentId) : null

  // Use messages from KV storage
  const messages = chat.messages || []

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="bg-background border-b px-4 py-6 md:py-8">
        <div className="mx-auto w-full max-w-3xl space-y-1">
          <h1 className="text-2xl font-bold">{title}</h1>
          <div className="text-muted-foreground text-sm">
            {formatDate(createdAt)} · {messages.length} messages
          </div>
        </div>
      </div>
      <div className="mx-auto flex w-full max-w-3xl flex-col px-4 pt-6 pb-16">
        {agent ? <AgentCard agent={agent} className="w-full max-w-none" /> : <Landing userId={userId} />}
        <ChatList agentImageUrl={agent?.imageUrl} agentName={agent?.name} avatarUrl={avatarUrl} messages={messages} />
      </div>
    </div>
  )
}
