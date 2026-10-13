"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import { useEffect, useState } from "react"
import { SidebarCollapsed } from "@/components/sidebar/sidebar-collapsed"
import { Button } from "@/components/ui/button"
import type { AuthUser } from "@/lib/auth-client"
import { cn } from "@/lib/utils"

type PermanentSidebarProps = {
  children: React.ReactNode
  className?: string
  user?: AuthUser
}

export function PermanentSidebar({ children, className, user }: PermanentSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)

  useEffect(() => {
    document.documentElement.setAttribute("data-sidebar-collapsed", isCollapsed.toString())
  }, [isCollapsed])

  return (
    <div
      className={cn(
        "relative hidden h-full flex-col border-border border-r bg-muted/20 transition-all duration-300 ease-in-out lg:flex",
        isCollapsed ? "w-16" : "w-80",
        className
      )}
    >
      {/* Collapse Toggle */}
      <Button
        aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="absolute top-6 -right-3 z-10 h-6 w-6 rounded-full border bg-background shadow-md hover:bg-accent"
        onClick={() => setIsCollapsed(!isCollapsed)}
        size="sm"
        variant="ghost"
      >
        {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
      </Button>

      {/* Sidebar Content */}
      <div className={cn("flex h-full flex-col overflow-hidden")}>
        {/* biome-ignore lint/suspicious/noLeakedRender: `children` is the expanded sidebar content and is meant to render */}
        {isCollapsed ? <SidebarCollapsed user={user} /> : children}
      </div>
    </div>
  )
}
