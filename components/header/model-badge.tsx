import { Badge } from "@/components/ui/badge"
import { getAiModel } from "@/lib/ai-model"

// Server component: shows the model the agents actually run on (AI_MODEL or the default).
export function ModelBadge() {
  return (
    <Badge
      className="hidden border-primary/20 bg-primary/10 px-2 py-0.5 font-mono text-[10px] text-primary lg:inline-flex"
      variant="secondary"
    >
      {getAiModel()}
    </Badge>
  )
}
