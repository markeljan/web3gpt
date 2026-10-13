"use client"

import { ExternalLink } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { NAVIGATION_ITEMS } from "@/components/sidebar/constants"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type NavigationProps = {
  className?: string
  variant?: "desktop" | "mobile"
}

export function Navigation({ className, variant = "desktop" }: NavigationProps) {
  const pathname = usePathname()

  if (variant === "mobile") {
    return (
      <nav className={cn("flex flex-col space-y-2", className)}>
        {NAVIGATION_ITEMS.map((item) => {
          const Icon = item.icon
          const isActive = !item.external && pathname === item.href
          const isExternal = item.external

          return (
            <Link
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 font-medium text-sm transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
              href={item.href}
              key={item.name}
              rel={isExternal ? "noopener noreferrer" : undefined}
              target={isExternal ? "_blank" : undefined}
            >
              <Icon className="h-4 w-4" />
              <span>{item.name}</span>
              {item.badge ? (
                <span className="ml-auto rounded bg-primary/20 px-1.5 py-0.5 font-semibold text-primary text-xs">
                  {item.badge}
                </span>
              ) : null}
              {isExternal ? <ExternalLink className="ml-auto h-3 w-3" /> : null}
            </Link>
          )
        })}
      </nav>
    )
  }

  return (
    <nav className={cn("flex items-center space-x-1", className)}>
      {NAVIGATION_ITEMS.map((item) => {
        const Icon = item.icon
        const isActive = !item.external && pathname === item.href
        const isExternal = item.external

        return (
          <Button
            asChild
            className={cn("relative", isActive && "bg-muted hover:bg-muted/80")}
            key={item.name}
            size="sm"
            variant={isActive ? "secondary" : "ghost"}
          >
            <Link
              className="flex items-center gap-2"
              href={item.href}
              rel={isExternal ? "noopener noreferrer" : undefined}
              target={isExternal ? "_blank" : undefined}
            >
              <Icon className="h-4 w-4" />
              <span>{item.name}</span>
              {item.badge ? (
                <span className="absolute -top-1 -right-1 rounded-full bg-primary px-1.5 py-0.5 font-semibold text-primary-foreground text-xs">
                  {item.badge}
                </span>
              ) : null}
            </Link>
          </Button>
        )
      })}
    </nav>
  )
}
