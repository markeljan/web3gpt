"use client"

import { useChatScroll } from "@/components/chat/chat-scroll-context"
import { IconArrowDown } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function ButtonScrollToBottom({ className }: { className?: string }) {
  const { isAtBottom, scrollToBottom } = useChatScroll()

  return (
    <Button
      aria-label="Scroll to latest message"
      className={cn(
        "bg-background absolute -top-5 left-1/2 z-10 size-9 -translate-x-1/2 rounded-full border shadow-lg transition-all duration-200 motion-reduce:transition-none",
        isAtBottom ? "pointer-events-none translate-y-1 opacity-0" : "translate-y-0 opacity-100",
        className
      )}
      // `inert` removes it from tab order and the accessibility tree together,
      // and blurs it if it is focused — unlike aria-hidden, which can end up on
      // a focused element when a new message re-pins the view.
      inert={isAtBottom}
      onClick={() => scrollToBottom()}
      size="icon"
      variant="outline"
    >
      <IconArrowDown className="size-4" />
    </Button>
  )
}
