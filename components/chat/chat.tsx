"use client"

import { type UIMessage, useChat } from "@ai-sdk/react"
import { DefaultChatTransport, generateId } from "ai"
import { usePathname, useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AgentCard } from "@/components/agent-card"
import { ChatList } from "@/components/chat/chat-list"
import { ChatPanel } from "@/components/chat/chat-panel"
import { ChatScrollProvider } from "@/components/chat/chat-scroll-context"
import { StreamAnnouncer } from "@/components/chat/stream-announcer"
import { Landing } from "@/components/landing"
import { NewChatButton } from "@/components/new-chat-button"
import { DEFAULT_AGENT, DEFAULT_AGENT_ID } from "@/lib/constants"
import { useStickToBottom } from "@/lib/hooks/use-stick-to-bottom"
import type { Agent } from "@/lib/types"
import { cn } from "@/lib/utils"

type ChatProps = {
  agent: Agent
  className?: string
  initialChatId?: string
  initialMessages?: UIMessage[]
  userId?: string
  avatarUrl?: string | null
}

// Each commit re-parses the whole accumulated markdown, so this throttle is the
// main lever on streaming cost for long replies. 100ms is already well under
// the threshold where autoscroll looks anything but continuous.
const CHAT_STREAM_THROTTLE_MS = 100

export const Chat = ({ initialChatId, initialMessages = [], agent, className, userId, avatarUrl }: ChatProps) => {
  const hasSyncedNewChat = useRef(false)
  const [chatId, setChatId] = useState<string | undefined>(initialChatId)
  // Bumped on every explicit "new chat" so a fresh id is minted even when the
  // previous chat had not been persisted (and `chatId` was already undefined).
  const [newChatNonce, setNewChatNonce] = useState(0)
  // `useChat` rebuilds its internal store whenever `id` changes, re-seeding it
  // from whatever `messages` it is handed. Passing the `initialMessages` prop
  // straight through would therefore resurrect the old conversation the moment
  // "new chat" mints a new id, so the seed is owned here and cleared with it.
  const [seedMessages, setSeedMessages] = useState<UIMessage[]>(initialMessages)
  const router = useRouter()
  const pathname = usePathname()

  const { contentRef, follow, isAtBottom, scrollRef, scrollToBottom } = useStickToBottom()
  const scrollContext = useMemo(() => ({ isAtBottom, scrollToBottom }), [isAtBottom, scrollToBottom])

  // Generate a new chat ID if not provided
  // biome-ignore lint/correctness/useExhaustiveDependencies: newChatNonce intentionally forces a fresh id
  const currentChatId = useMemo(() => chatId || generateId(), [chatId, newChatNonce])

  const { messages, status, stop, sendMessage, setMessages, regenerate, error, id } = useChat({
    id: currentChatId,
    messages: seedMessages,
    throttle: CHAT_STREAM_THROTTLE_MS,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: {
        agentId: agent.id || DEFAULT_AGENT.id,
        chatId: currentChatId,
      },
    }),
  })

  // Re-pin after every streamed update. This is the primary autoscroll driver:
  // it is tied to React commits rather than to the browser's rendering steps.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `messages` is the growth signal we re-pin on
  useEffect(() => {
    follow()
  }, [messages, follow])

  const isStreaming = status === "streaming"
  const isInProgress = isStreaming || status === "submitted"
  const showLanding = agent.id === DEFAULT_AGENT_ID && !initialChatId
  const isEmpty = messages.length === 0

  const handleNewChat = useCallback(() => {
    hasSyncedNewChat.current = false
    setSeedMessages([])
    setChatId(undefined)
    setNewChatNonce((nonce) => nonce + 1)
    setMessages([])
  }, [setMessages])

  const handleSubmit = useCallback(
    (text: string) => {
      scrollToBottom("auto")
      return sendMessage({ text })
    },
    [scrollToBottom, sendMessage]
  )

  // Only signed-in chats are persisted, so only they have a `/chat/:id` route to
  // move to. Navigating an anonymous reader there lands them on a sign-in
  // redirect and loses the conversation they are still reading.
  //
  // The sidebar refresh has to come *after* that navigation lands: refreshing
  // `/` and then immediately replacing the route throws the fresh layout away.
  // Once per mount is enough — refreshing after every exchange re-renders the
  // whole tree while the reader is mid-response.
  useEffect(() => {
    if (!(userId && id) || isInProgress || messages.length === 0) {
      return
    }

    const nextPath = `/chat/${id}`
    if (pathname !== nextPath) {
      router.replace(nextPath)
      return
    }

    // biome-ignore lint/suspicious/noUnnecessaryConditions: Biome types useRef(false).current as always false, but it is set to true below and persists across renders
    if (!hasSyncedNewChat.current) {
      hasSyncedNewChat.current = true
      router.refresh()
    }
  }, [id, isInProgress, messages.length, pathname, router, userId])

  return (
    <ChatScrollProvider value={scrollContext}>
      <div className={cn("relative flex h-full min-h-0 flex-col", className)}>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" ref={scrollRef}>
          <div
            className={cn(
              "mx-auto flex w-full max-w-3xl flex-col px-4 pt-6 pb-6 md:pt-10",
              // With nothing to read yet, centre the intro instead of leaving a
              // dead gap between it and the composer.
              isEmpty && "min-h-full justify-center pt-0 md:pt-0"
            )}
            ref={contentRef}
          >
            {showLanding ? (
              <Landing userId={userId} />
            ) : (
              <AgentCard agent={agent} className="w-full max-w-none">
                <NewChatButton agentId={agent.id} onNewChat={handleNewChat} />
              </AgentCard>
            )}
            <ChatList
              agentImageUrl={agent.imageUrl}
              agentName={agent.name}
              avatarUrl={avatarUrl}
              isStreaming={isStreaming}
              messages={messages}
              status={status}
            />
          </div>
        </div>
        <StreamAnnouncer status={status} />
        <ChatPanel
          error={error}
          isEmpty={isEmpty}
          isLoading={isInProgress}
          onNewChat={handleNewChat}
          onRetry={regenerate}
          onSubmit={handleSubmit}
          stop={stop}
        />
      </div>
    </ChatScrollProvider>
  )
}
