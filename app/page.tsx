import type { Metadata } from "next"
import { Chat } from "@/components/chat/chat"
import { HomeIntro } from "@/components/home-intro"
import { getSession } from "@/lib/auth"
import { DEFAULT_AGENT } from "@/lib/constants"
import { getAgentById } from "@/lib/data/agents"
import type { NextPageProps } from "@/lib/types"

// Only the homepage: set in the root layout, every page would inherit "/".
export const metadata: Metadata = {
  alternates: { canonical: "/" },
}

export default async function ChatPage({ searchParams }: NextPageProps) {
  const searchParamsResolved = await searchParams
  const agentIdParam = typeof searchParamsResolved?.a === "string" ? searchParamsResolved.a : null

  const agent = (agentIdParam && (await getAgentById(agentIdParam))) || DEFAULT_AGENT
  const session = await getSession()
  const { id, image } = session?.user || {}

  return (
    <>
      <HomeIntro />
      <Chat agent={agent} avatarUrl={image} key={agent.id} userId={id} />
    </>
  )
}
