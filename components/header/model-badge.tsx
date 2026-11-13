import { Badge } from "@/components/ui/badge"
import { getAiModel } from "@/lib/ai-model"

// Server component: shows the model the agents actually run on (AI_MODEL or the default).
export function ModelBadge() {
  return (
    <Badge
      className="border-primary/20 bg-primary/10 text-primary hidden px-2 py-0.5 font-mono text-[10px] lg:inline-flex"
      variant="secondary"
    >
      {getAiModel()}
    </Badge>
  )
}
