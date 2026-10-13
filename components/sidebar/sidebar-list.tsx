"use client"

import { usePathname } from "next/navigation"
import { SidebarActions } from "@/components/sidebar/sidebar-actions"
import { SidebarItem } from "@/components/sidebar/sidebar-item"
import type { DbChatListItem } from "@/lib/types"

export type SidebarListProps = {
  chatList?: DbChatListItem[] | null
}

export function SidebarList({ chatList }: SidebarListProps) {
  const pathname = usePathname()
  const [, activeChatId] = pathname.split("/chat/")

  return (
    <div className="scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent h-full overflow-y-auto">
      {chatList?.length ? (
        <div className="space-y-1 px-2 pb-2">
          {chatList?.map((chat) => (
            <SidebarItem chat={chat} isActive={chat.id === activeChatId} key={chat.id}>
              <SidebarActions chat={chat} />
            </SidebarItem>
          ))}
        </div>
      ) : (
        <div className="p-8 text-center">
          <p className="text-muted-foreground text-sm">No chat history found</p>
        </div>
      )}
    </div>
  )
}
