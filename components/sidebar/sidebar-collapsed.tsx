"use client"

import { User } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { UserMenu } from "@/components/header/user-menu"
import { NAVIGATION_ITEMS } from "@/components/sidebar/constants"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { type AuthUser, signIn } from "@/lib/auth-client"
import { cn } from "@/lib/utils"

type SidebarCollapsedProps = {
  user?: AuthUser
}

export function SidebarCollapsed({ user }: SidebarCollapsedProps) {
  const pathname = usePathname()

  return (
    <div className="flex h-full flex-col items-center py-4">
      {/* Logo */}
      <div className="mb-6">
        <Link className="block" href="/">
          <Tooltip>
            <TooltipTrigger asChild>
              <Image alt="Web3GPT" className="rounded-lg" height={32} src="/assets/web3gpt.png" width={32} />
            </TooltipTrigger>
            <TooltipContent side="right">Web3GPT</TooltipContent>
          </Tooltip>
        </Link>
      </div>

      {/* Navigation Icons */}
      <div className="mb-6 flex flex-col space-y-2">
        {NAVIGATION_ITEMS.map((item) => {
          const Icon = item.icon
          const isExternal = item.external
          const isActive = !isExternal && pathname === item.href

          return (
            <Tooltip key={item.name}>
              <TooltipTrigger asChild>
                <Button
                  asChild
                  className={cn("h-10 w-10 p-0", isActive && "bg-muted hover:bg-muted/80")}
                  size="sm"
                  variant={isActive ? "secondary" : "ghost"}
                >
                  <Link
                    href={item.href}
                    rel={isExternal ? "noopener noreferrer" : undefined}
                    target={isExternal ? "_blank" : undefined}
                  >
                    <Icon className="h-5 w-5" />
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">{item.name}</TooltipContent>
            </Tooltip>
          )
        })}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* User Profile at Bottom */}
      <div className="mt-auto">
        {user ? (
          <UserMenu user={user} variant="collapsed" />
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label="Sign in with GitHub"
                className="h-10 w-10 p-0"
                onClick={() => signIn.social({ callbackURL: "/", provider: "github" })}
                size="sm"
                variant="ghost"
              >
                <User className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Sign in with GitHub</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  )
}
