import { AssistantAvatar } from "@/components/chat/assistant-avatar"

const DOTS = [0, 1, 2]
const DOT_DELAY_MS = 150

type ThinkingIndicatorProps = {
  agentImageUrl?: string | null
  agentName?: string
}

export function ThinkingIndicator({ agentImageUrl, agentName }: ThinkingIndicatorProps) {
  return (
    <div className="flex w-full items-center gap-3">
      <AssistantAvatar imageUrl={agentImageUrl} name={agentName} />
      <div className="flex items-center gap-1.5" role="status">
        <span className="sr-only">Generating a response</span>
        {DOTS.map((dot) => (
          <span
            aria-hidden="true"
            className="bg-muted-foreground/60 size-1.5 animate-bounce rounded-full motion-reduce:animate-pulse"
            key={dot}
            style={{ animationDelay: `${dot * DOT_DELAY_MS}ms` }}
          />
        ))}
      </div>
    </div>
  )
}
