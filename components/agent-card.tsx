"use client"

import Image from "next/image"
import type { ReactNode } from "react"
import { useState } from "react"
import { CopyAgentUrlButton } from "@/components/copy-agent-url-button"
import type { Agent } from "@/lib/types"
import { cn } from "@/lib/utils"

type AgentCardProps = {
  agent: Agent
  className?: string
  children?: ReactNode
}

export const AgentCard = ({ agent, className, children }: AgentCardProps) => {
  const [descriptionClamped, setDescriptionClamped] = useState(true)

  return (
    <div
      className={cn(
        "mx-auto mb-8 flex max-w-2xl items-start gap-4 rounded-lg border border-gray-600/20 bg-background/50 p-4 dark:border-gray-600/30",
        className
      )}
    >
      <div className="relative mt-4 size-16 shrink-0">
        <Image
          alt={`${agent.name} image`}
          className="rounded-lg object-contain"
          fill
          priority={true}
          sizes="64px"
          src={agent.imageUrl}
        />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="truncate font-semibold text-lg">{agent.name}</h3>
        <p
          className={cn(
            "text-gray-600 text-sm dark:text-gray-400",
            descriptionClamped ? "line-clamp-2" : "line-clamp-none"
          )}
        >
          <span>{agent.description}</span>
        </p>
        <div className="flex w-full items-center justify-end gap-1 text-gray-500 text-xs hover:text-gray-600 dark:hover:text-gray-400">
          <button onClick={() => setDescriptionClamped(!descriptionClamped)} type="button">
            {descriptionClamped ? "Show more" : "Show less"}
          </button>
        </div>
        <p className="mt-1 text-gray-500 text-xs">by {agent.creator}</p>
      </div>
      <div className="flex shrink-0 gap-1">
        {children}
        <CopyAgentUrlButton agentId={agent.id} />
      </div>
    </div>
  )
}
