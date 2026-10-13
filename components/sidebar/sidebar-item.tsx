"use client"

import Link from "next/link"
import { IconMessage, IconUsers } from "@/components/icons"
import { buttonVariants } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { DbChatListItem } from "@/lib/types"
import { cn } from "@/lib/utils"

type SidebarItemProps = {
  chat: DbChatListItem
  isActive: boolean
  children: React.ReactNode
}

export function SidebarItem({ chat, isActive, children }: SidebarItemProps) {
  // biome-ignore lint/suspicious/noUnnecessaryConditions: chat list entries come from KV, which is untyped at runtime
  if (!chat?.id) {
    return null
  }

  return (
    <div className="group relative">
      <div className="absolute top-1 left-2 flex size-6 items-center justify-center">
        {chat.published ? (
          <Tooltip delayDuration={1000}>
            <TooltipTrigger className="focus:bg-muted focus:ring-1 focus:ring-ring" tabIndex={-1}>
              <IconUsers className="mr-2" />
            </TooltipTrigger>
            <TooltipContent>This is a published chat.</TooltipContent>
          </Tooltip>
        ) : (
          <IconMessage className="mr-2" />
        )}
      </div>
      <Link
        className={cn(buttonVariants({ variant: "ghost" }), "w-full pr-4 pl-8", isActive && "bg-accent pr-16")}
        href={`/chat/${chat.id}`}
      >
        <div className="relative max-h-5 flex-1 select-none overflow-hidden text-ellipsis break-all" title={chat.title}>
          <span className="whitespace-nowrap">{chat.title}</span>
        </div>
      </Link>
      <div className={cn("absolute top-1 right-2 hidden", isActive && "block")}>{children}</div>
    </div>
  )
}
