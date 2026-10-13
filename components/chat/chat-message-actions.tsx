"use client"

import type { UIMessage } from "ai"
import { IconCheck, IconCopy } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useCopyToClipboard } from "@/lib/hooks/use-copy-to-clipboard"
import type { LegacyMessage } from "@/lib/types"
import { cn } from "@/lib/utils"

const COPY_FEEDBACK_MS = 2000

type ChatMessageActionsProps = React.ComponentProps<"div"> & {
  message: UIMessage | LegacyMessage
}

// Helper function to extract text content from both v4 and v5 message formats
function getMessageText(message: UIMessage | LegacyMessage): string {
  // Handle v5 format (parts array)
  const parts = "parts" in message ? message.parts : undefined
  if (parts && Array.isArray(parts) && parts.length > 0) {
    return parts
      .filter((part) => part.type === "text" && "text" in part)
      .map((part) => ("text" in part ? part.text : ""))
      .join("")
  }

  // Handle v4 format (content property) for backward compatibility
  if ("content" in message && message.content) {
    const { content } = message
    if (typeof content === "string") {
      return content
    }
    if (Array.isArray(content)) {
      return (content as Array<{ type?: string; text?: string }>)
        .filter((part) => part.type === "text" && typeof part.text === "string")
        .map((part) => part.text || "")
        .join("")
    }
  }

  return ""
}

export function ChatMessageActions({ message, className, ...props }: ChatMessageActionsProps) {
  const { isCopied, copyToClipboard } = useCopyToClipboard({ timeout: COPY_FEEDBACK_MS })
  const messageText = getMessageText(message)

  if (!messageText) {
    return null
  }

  return (
    <div
      className={cn(
        // Always visible on touch devices, revealed on hover/focus on pointer devices.
        "flex items-center gap-1 transition-opacity duration-150",
        "md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100",
        className
      )}
      {...props}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-label={isCopied ? "Copied to clipboard" : "Copy message"}
            className="size-8 text-muted-foreground hover:text-foreground"
            onClick={() => copyToClipboard(messageText)}
            size="icon"
            variant="ghost"
          >
            {isCopied ? <IconCheck className="size-3.5" /> : <IconCopy className="size-3.5" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{isCopied ? "Copied" : "Copy"}</TooltipContent>
      </Tooltip>
    </div>
  )
}
