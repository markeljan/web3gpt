import Image from "next/image"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { AGENTS_ARRAY } from "@/lib/constants"
import { cn } from "@/lib/utils"

export const SidebarAgents = () => (
  <div className="space-y-1">
    {AGENTS_ARRAY.map((assistant) => (
      <Tooltip delayDuration={700} key={assistant.id}>
        <TooltipTrigger className="w-full focus:bg-muted focus:ring-1 focus:ring-ring">
          <Button
            asChild
            className={cn(
              "flex h-9 w-full items-center justify-start overflow-clip p-2 hover:bg-accent hover:text-accent-foreground hover:no-underline"
            )}
            variant="link"
          >
            <Link className="flex w-full items-center space-x-2" href={`/?a=${assistant.id}`}>
              <div className="relative h-5 w-5 shrink-0">
                <Image
                  alt={`${assistant.name} image`}
                  className="rounded-full object-cover"
                  fill
                  sizes="20px"
                  src={assistant.imageUrl}
                />
              </div>
              <p className="flex-1 truncate text-left font-medium text-foreground text-xs">{assistant.name}</p>
            </Link>
          </Button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{assistant.description}</TooltipContent>
      </Tooltip>
    ))}
  </div>
)
