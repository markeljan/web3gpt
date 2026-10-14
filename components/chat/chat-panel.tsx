"use client"

import { RefreshCw, TriangleAlert } from "lucide-react"
import { ButtonScrollToBottom } from "@/components/chat/button-scroll-to-bottom"
import { PromptForm } from "@/components/chat/prompt-form"
import { Button } from "@/components/ui/button"

export type ChatPanelProps = {
  onSubmit: (text: string) => void
  stop: () => void
  onNewChat: () => void
  onRetry: () => void
  isLoading: boolean
  isEmpty: boolean
  error?: Error
}

export function ChatPanel({ isLoading, isEmpty, error, onSubmit, onRetry, stop, onNewChat }: ChatPanelProps) {
  return (
    <div className="relative shrink-0 bg-background">
      {/* Fades the last line of the transcript into the composer instead of cutting it off. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-10 h-10 bg-linear-to-t from-background to-transparent"
      />
      <ButtonScrollToBottom />
      <div className="mx-auto w-full max-w-3xl px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {error ? (
          <div
            className="mb-2 flex items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive text-sm"
            role="alert"
          >
            <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
            <span className="min-w-0 flex-1">Something went wrong generating that response.</span>
            <Button className="h-7 shrink-0 gap-1.5 px-2" onClick={() => onRetry()} size="sm" variant="ghost">
              <RefreshCw aria-hidden="true" className="size-3.5" />
              Retry
            </Button>
          </div>
        ) : null}
        <PromptForm isEmpty={isEmpty} isLoading={isLoading} onNewChat={onNewChat} onSubmit={onSubmit} stop={stop} />
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          Web3GPT can make mistakes. Review contracts before deploying.
        </p>
      </div>
    </div>
  )
}
