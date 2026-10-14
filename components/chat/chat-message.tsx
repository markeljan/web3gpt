import type { UIMessage } from "ai"
import { Check, CircleDashed, Loader2, X } from "lucide-react"
import Image from "next/image"
import { Fragment, memo, type ReactNode } from "react"
import type { Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
} from "@/components/ai-elements/chain-of-thought"
import { AssistantAvatar } from "@/components/chat/assistant-avatar"
import { ChatMessageActions } from "@/components/chat/chat-message-actions"
import { CodeBlock } from "@/components/code-block"
import { IconUser } from "@/components/icons"
import { MemoizedReactMarkdown } from "@/components/markdown"
import { normalizeCodeLanguage } from "@/lib/code-language"
import type { LegacyMessage } from "@/lib/types"
import { cn } from "@/lib/utils"

export type ChatMessageProps = {
  message: UIMessage | LegacyMessage
  isStreaming?: boolean
  isLastMessage?: boolean
  avatarUrl?: string | null
  agentImageUrl?: string | null
  agentName?: string
}

type MessageParts = UIMessage["parts"]
type MessagePart = MessageParts[number]
type ReasoningPart = Extract<MessagePart, { type: "reasoning" }>

const LANGUAGE_REGEX = /language-([a-z0-9#+-]+)/i
const NEWLINE_REGEX = /\n$/
const REASONING_SPLIT_REGEX = /\n{2,}/
const REASONING_HEADING_REGEX = /^#{1,6}\s*/
const TOOL_NAME_SEPARATOR_REGEX = /[_-]+/g

function splitReasoningText(text: string): { title: string; details: string } {
  const normalized = text.trim()

  if (!normalized) {
    return { details: "", title: "Thinking" }
  }

  const [headline, ...rest] = normalized.split(REASONING_SPLIT_REGEX)

  return {
    details: rest.join("\n\n").trim(),
    title: headline.replace(REASONING_HEADING_REGEX, "").trim() || "Thinking",
  }
}

// Helper to check if a part is a tool invocation (starts with "tool-" or is "dynamic-tool")
function isToolPart(part: MessagePart): boolean {
  return part.type.startsWith("tool-") || part.type === "dynamic-tool"
}

// Helper to get tool name from a tool part
function getToolNameFromPart(part: MessagePart): string {
  if (part.type === "dynamic-tool" && "toolName" in part) {
    return String(part.toolName)
  }
  if (part.type.startsWith("tool-")) {
    return part.type.replace("tool-", "")
  }
  return "unknown"
}

// "deploy_contract" / "deploy-contract" -> "Deploy contract"
function humanizeToolName(toolName: string): string {
  const spaced = toolName.replace(TOOL_NAME_SEPARATOR_REGEX, " ").trim()
  if (!spaced) {
    return "Tool"
  }
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

type ToolDisplay = {
  icon: ReactNode
  label: (name: string) => string
  className: string
}

function getToolDisplay(state: string | undefined): ToolDisplay {
  const runningStates = ["input-streaming", "input-available", "approval-requested"]
  const completeStates = ["output-available", "approval-responded"]
  const errorStates = ["output-error", "output-denied"]

  if (state && runningStates.includes(state)) {
    return {
      className: "border-border bg-muted/40 text-foreground",
      icon: (
        <Loader2
          aria-hidden="true"
          className="size-3.5 animate-spin text-muted-foreground motion-reduce:animate-none"
        />
      ),
      label: (name) => `Running ${name.toLowerCase()}`,
    }
  }
  if (state && completeStates.includes(state)) {
    return {
      className: "border-border bg-muted/30 text-muted-foreground",
      icon: <Check aria-hidden="true" className="size-3.5 text-primary" />,
      label: (name) => name,
    }
  }
  if (state && errorStates.includes(state)) {
    return {
      className: "border-destructive/40 bg-destructive/10 text-destructive",
      icon: <X aria-hidden="true" className="size-3.5" />,
      label: (name) => `${name} failed`,
    }
  }
  return {
    className: "border-border bg-muted/30 text-muted-foreground",
    icon: <CircleDashed aria-hidden="true" className="size-3.5" />,
    label: (name) => name,
  }
}

// Component for rendering tool invocation parts
function ToolInvocationPart({ part }: { part: MessagePart }) {
  const toolName = humanizeToolName(getToolNameFromPart(part))
  const toolState = "state" in part ? (part.state as string | undefined) : undefined
  const { icon, label, className } = getToolDisplay(toolState)

  return (
    <div
      className={cn("my-1 inline-flex max-w-full items-center gap-2 rounded-lg border px-3 py-1.5 text-xs", className)}
    >
      {icon}
      <span className="truncate font-medium">{label(toolName)}</span>
    </div>
  )
}

// Helper function to extract parts from both v4 (content) and v5 (parts) message formats
function getMessageParts(message: UIMessage | LegacyMessage): MessageParts {
  // Handle v5 format (parts array)
  const parts = "parts" in message ? message.parts : undefined
  if (parts && Array.isArray(parts) && parts.length > 0) {
    return parts as MessageParts
  }

  // Handle v4 format (content property) for backward compatibility
  if ("content" in message && message.content) {
    const { content } = message
    if (typeof content === "string") {
      return [{ text: content, type: "text" }]
    }
    if (Array.isArray(content)) {
      return content as MessageParts
    }
  }

  return []
}

function ChatMessageComponent({
  message,
  avatarUrl,
  agentImageUrl,
  agentName,
  isStreaming = false,
  isLastMessage = false,
}: ChatMessageProps) {
  // Extract parts from message - handle both v4 (content) and v5 (parts) formats
  const messageParts = getMessageParts(message)
  const isUser = message.role === "user"

  const components: Components = {
    a({ href, children }) {
      return (
        <a href={href} rel="noopener noreferrer" target="_blank">
          {children}
        </a>
      )
    },
    code({ className, children, node: _node, ...props }) {
      const childArray = Array.isArray(children) ? children : [children]
      const code = childArray.map((child) => (typeof child === "string" ? child : "")).join("")
      const inlineFromProps = "inline" in props && Boolean((props as { inline?: boolean }).inline)
      const hasLanguageClass = Boolean(LANGUAGE_REGEX.exec(className || "") || className?.includes("language-"))
      const hasBlockShape = code.includes("\n")
      const isInline = inlineFromProps || !(hasLanguageClass || hasBlockShape)

      if (code === "▍") {
        return <span className="mt-1 animate-pulse cursor-default">▍</span>
      }

      const match = LANGUAGE_REGEX.exec(className || "")
      const normalizedLanguage = normalizeCodeLanguage(match?.[1], code, {
        inferFromContent: !isInline,
      })

      if (isInline) {
        return (
          <code className={className} {...props}>
            {children}
          </code>
        )
      }

      return (
        <CodeBlock
          isStreaming={isStreaming && isLastMessage}
          key={message.id}
          language={normalizedLanguage}
          value={code.replace(NEWLINE_REGEX, "")}
        />
      )
    },
    p({ children }) {
      return <p className="mb-2 last:mb-0">{children}</p>
    },
    pre({ children }) {
      return <>{children}</>
    },
  }

  const getIsPartStreaming = (part: MessagePart, index: number) => {
    const isLastPart = index === messageParts.length - 1
    const partState = "state" in part ? part.state : undefined

    return partState === "streaming" || (isStreaming && isLastMessage && isLastPart && !partState)
  }

  const reasoningEntries = messageParts.reduce<Array<{ index: number; part: ReasoningPart; isStreaming: boolean }>>(
    (entries, part, index) => {
      if (part.type === "reasoning") {
        entries.push({
          index,
          isStreaming: getIsPartStreaming(part, index),
          part: part as ReasoningPart,
        })
      }

      return entries
    },
    []
  )

  const firstReasoningIndex = reasoningEntries[0]?.index ?? -1

  const renderItems: Array<
    | { key: string; type: "reasoning" }
    | { key: string; text: string; type: "text" }
    | { key: string; part: MessagePart; type: "tool" }
    | { key: string; part: MessagePart; type: "source-url" }
  > = []
  let textBuffer = ""
  let textStartIndex: number | null = null

  const flushTextBuffer = () => {
    if (!textBuffer) {
      return
    }

    renderItems.push({
      key: `${message.id}-text-${textStartIndex ?? renderItems.length}`,
      text: textBuffer,
      type: "text",
    })
    textBuffer = ""
    textStartIndex = null
  }

  for (const [index, part] of messageParts.entries()) {
    if (part.type === "reasoning") {
      if (index === firstReasoningIndex) {
        flushTextBuffer()
        renderItems.push({
          key: `${message.id}-reasoning-group`,
          type: "reasoning",
        })
      }
      continue
    }

    if (part.type === "step-start") {
      continue
    }

    if (part.type === "text") {
      textStartIndex ??= index
      textBuffer += part.text || ""
      continue
    }

    flushTextBuffer()

    if (isToolPart(part)) {
      renderItems.push({
        key: `${message.id}-tool-${index}`,
        part,
        type: "tool",
      })
      continue
    }

    if (part.type === "source-url") {
      renderItems.push({
        key: `${message.id}-source-${index}`,
        part,
        type: "source-url",
      })
    }
  }

  flushTextBuffer()

  const renderReasoningGroup = () => {
    if (!reasoningEntries.length) {
      return null
    }

    const isReasoningStreaming = reasoningEntries.some((entry) => entry.isStreaming)

    return (
      <ChainOfThought
        className="mb-3 rounded-xl border border-border/60 bg-muted/20 px-3 py-3 pb-4"
        defaultOpen={false}
        key={`${message.id}-reasoning-group`}
      >
        <ChainOfThoughtHeader>
          {isReasoningStreaming ? "Thinking..." : "Thought for a few seconds"}
        </ChainOfThoughtHeader>
        <ChainOfThoughtContent className="mt-4">
          {reasoningEntries.map(({ index, part, isStreaming: isEntryStreaming }) => {
            const { title, details } = splitReasoningText(part.text || "")

            return (
              <ChainOfThoughtStep
                className="gap-3 last:[&_[data-chain-line]]:hidden"
                key={`${message.id}-reasoning-step-${index}`}
                label={
                  <MemoizedReactMarkdown
                    className="prose prose-sm dark:prose-invert prose-headings:my-0 prose-p:my-0 prose-pre:my-2 max-w-full break-words prose-pre:p-0"
                    components={components}
                    remarkPlugins={[remarkGfm, remarkMath]}
                  >
                    {title}
                  </MemoizedReactMarkdown>
                }
                status={isEntryStreaming ? "active" : "complete"}
              >
                {details ? (
                  <MemoizedReactMarkdown
                    className="prose prose-sm dark:prose-invert prose-headings:my-0 prose-ol:my-2 prose-p:my-0 prose-pre:my-2 prose-ul:my-2 max-w-full break-words prose-pre:p-0 text-muted-foreground"
                    components={components}
                    remarkPlugins={[remarkGfm, remarkMath]}
                  >
                    {details}
                  </MemoizedReactMarkdown>
                ) : null}
              </ChainOfThoughtStep>
            )
          })}
        </ChainOfThoughtContent>
      </ChainOfThought>
    )
  }

  const renderMessageParts = () =>
    renderItems.map((item) => {
      let content: ReactNode = null

      if (item.type === "reasoning") {
        content = renderReasoningGroup()
      } else if (item.type === "text") {
        content = (
          <MemoizedReactMarkdown
            className={cn(
              "prose prose-pre:my-3 max-w-full break-words prose-pre:bg-transparent prose-pre:p-0 prose-p:leading-relaxed",
              // The bubble sets its own foreground; force every prose descendant
              // to inherit it rather than using the (inverted) prose palette.
              isUser ? "prose-p:my-0 text-inherit [&_*]:text-inherit" : "dark:prose-invert"
            )}
            components={components}
            remarkPlugins={[remarkGfm, remarkMath]}
          >
            {item.text}
          </MemoizedReactMarkdown>
        )
      } else if (item.type === "tool") {
        content = <ToolInvocationPart part={item.part} />
      } else if (item.type === "source-url" && item.part.type === "source-url") {
        content = (
          <a
            className="my-1 inline-flex items-center gap-1 text-primary text-xs hover:underline"
            href={item.part.url}
            rel="noopener noreferrer"
            target="_blank"
          >
            [{item.part.sourceId}] {item.part.title || item.part.url}
          </a>
        )
      }

      return <Fragment key={item.key}>{content}</Fragment>
    })

  // An assistant turn can exist before any content arrives; the list renders a
  // thinking indicator for that state instead of an empty block.
  if (renderItems.length === 0) {
    return null
  }

  if (isUser) {
    return (
      <div className="group flex w-full flex-col items-end gap-1.5">
        <div className="flex max-w-[85%] items-start gap-3">
          <div className="min-w-0 overflow-hidden rounded-2xl bg-secondary px-4 py-2.5 text-secondary-foreground">
            {renderMessageParts()}
          </div>
          <div className="relative mt-0.5 flex size-7 shrink-0 select-none items-center justify-center overflow-hidden rounded-full border bg-background">
            {avatarUrl ? (
              <Image alt="Your avatar" fill sizes="28px" src={avatarUrl} />
            ) : (
              <IconUser className="size-4" />
            )}
          </div>
        </div>
        <ChatMessageActions className="mr-10" message={message} />
      </div>
    )
  }

  return (
    <div className="group flex w-full items-start gap-3">
      <AssistantAvatar className="mt-0.5" imageUrl={agentImageUrl} name={agentName} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="min-w-0 space-y-2">{renderMessageParts()}</div>
        <ChatMessageActions message={message} />
      </div>
    </div>
  )
}

export const ChatMessage = memo(ChatMessageComponent)
