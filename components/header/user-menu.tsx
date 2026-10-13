"use client"

import Image from "next/image"
import Link from "next/link"
import { useTheme } from "next-themes"
import { useState, useTransition } from "react"
import {
  IconClear,
  IconCog,
  IconGitHub,
  IconMoon,
  IconPC,
  IconSpinner,
  IconSun,
  IconTelegram,
  IconTwitter,
} from "@/components/icons"
import { SignOutButton } from "@/components/sign-out-button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { clearChatsAction } from "@/lib/actions/chat"
import type { AuthUser } from "@/lib/auth-client"
import { cn } from "@/lib/utils"

function getUserInitials(name: string) {
  const [firstName, lastName] = name.split(" ")

  return lastName ? `${firstName[0]}${lastName[0]}` : firstName.slice(0, 2)
}

type UserMenuProps = {
  user: AuthUser
  variant?: "header" | "sidebar" | "collapsed"
  showClearHistory?: boolean
}

export const UserMenu = ({ user, variant = "header", showClearHistory = false }: UserMenuProps) => {
  const { setTheme, theme } = useTheme()
  const [_, startTransition] = useTransition()
  const [clearHistoryOpen, setClearHistoryOpen] = useState(false)
  const [isClearPending, startClearTransition] = useTransition()

  const renderClearHistory = () => {
    if (!showClearHistory) {
      return null
    }

    return (
      <>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <AlertDialog onOpenChange={setClearHistoryOpen} open={clearHistoryOpen}>
            <AlertDialogTrigger asChild>
              <Button className="h-auto w-full justify-start p-0 font-normal" disabled={isClearPending} variant="ghost">
                {isClearPending ? <IconSpinner className="mr-2" /> : null}
                <IconClear className="mr-2 h-4 w-4" />
                Clear History
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete your chat history and remove your data from our servers.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isClearPending}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  disabled={isClearPending}
                  onClick={(event) => {
                    event.preventDefault()
                    startClearTransition(async () => {
                      await clearChatsAction()
                      setClearHistoryOpen(false)
                    })
                  }}
                >
                  {isClearPending ? <IconSpinner className="mr-2 animate-spin" /> : null}
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </DropdownMenuItem>
      </>
    )
  }

  const renderSettingsItems = () => (
    <>
      <DropdownMenuSeparator />
      <div className="mx-1 flex flex-row justify-between px-6 py-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              className="h-8 w-8"
              onClick={() => {
                startTransition(() => {
                  setTheme("light")
                })
              }}
              size="icon"
              variant={theme === "light" ? "default" : "ghost"}
            >
              <IconSun className="h-4 w-4" />
              <span className="sr-only">Light theme</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Light theme</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              className="h-8 w-8"
              onClick={() => {
                startTransition(() => {
                  setTheme("dark")
                })
              }}
              size="icon"
              variant={theme === "dark" ? "default" : "ghost"}
            >
              <IconMoon className="h-4 w-4" />
              <span className="sr-only">Dark theme</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Dark theme</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              className="h-8 w-8"
              onClick={() => {
                startTransition(() => {
                  setTheme("system")
                })
              }}
              size="icon"
              variant={theme === "system" ? "default" : "ghost"}
            >
              <IconPC className="h-4 w-4" />
              <span className="sr-only">System theme</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>System theme</TooltipContent>
        </Tooltip>
      </div>
      <DropdownMenuSeparator />
      <div className="mx-1 flex flex-row justify-between px-4 py-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              className={cn(buttonVariants({ size: "icon", variant: "ghost" }), "h-8 w-8")}
              href="https://x.com/w3gptai"
              rel="noopener noreferrer"
              target="_blank"
            >
              <IconTwitter className="h-4 w-4" />
              <span className="sr-only">X</span>
            </Link>
          </TooltipTrigger>
          <TooltipContent>Twitter</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              className={cn(buttonVariants({ size: "icon", variant: "ghost" }), "h-8 w-8")}
              href="https://t.me/w3gptai"
              rel="noopener noreferrer"
              target="_blank"
            >
              <IconTelegram className="h-4 w-4" />
              <span className="sr-only">Telegram</span>
            </Link>
          </TooltipTrigger>
          <TooltipContent>Telegram</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              className={cn(buttonVariants({ size: "icon", variant: "ghost" }), "h-8 w-8")}
              href="https://github.com/markeljan/web3gpt"
              rel="noopener noreferrer"
              target="_blank"
            >
              <IconGitHub className="h-4 w-4" />
              <span className="sr-only">Github</span>
            </Link>
          </TooltipTrigger>
          <TooltipContent>Github</TooltipContent>
        </Tooltip>
      </div>
    </>
  )
  if (variant === "collapsed") {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="h-10 w-10 rounded-full p-0" variant="ghost">
            {user?.image ? (
              <Image
                alt="User profile image"
                className="h-8 w-8 select-none rounded-full ring-1 ring-zinc-100/10 transition-opacity duration-300 hover:opacity-80"
                height={32}
                src={`${user.image}&s=60`}
                width={32}
              />
            ) : (
              <div className="flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-full bg-muted/50 font-medium text-muted-foreground text-xs uppercase">
                {user?.name ? getUserInitials(user?.name) : null}
              </div>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[220px]" side="right" sideOffset={8}>
          <DropdownMenuItem className="flex-col items-start">
            <div className="font-medium text-xs">{user?.name}</div>
            <div className="text-xs text-zinc-500">{user?.email}</div>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <SignOutButton />
          </DropdownMenuItem>
          {renderClearHistory()}
          {renderSettingsItems()}
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  if (variant === "sidebar") {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="h-auto w-full justify-start p-3 hover:bg-accent/50" variant="ghost">
            <div className="flex w-full items-center gap-3">
              {user?.image ? (
                <Image
                  alt="User profile image"
                  className="size-8 select-none rounded-full ring-1 ring-zinc-100/10 transition-opacity duration-300 hover:opacity-80"
                  height={32}
                  src={`${user.image}&s=60`}
                  width={32}
                />
              ) : (
                <div className="flex size-8 shrink-0 select-none items-center justify-center rounded-full bg-muted/50 font-medium text-muted-foreground text-xs uppercase">
                  {user?.name ? getUserInitials(user?.name) : null}
                </div>
              )}
              <div className="min-w-0 flex-1 text-left">
                <div className="truncate font-medium text-sm">{user?.name}</div>
                <div className="truncate text-muted-foreground text-xs">{user?.email}</div>
              </div>
              <IconCog className="mr-2 size-4 text-muted-foreground" />
            </div>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[220px]" sideOffset={8}>
          <DropdownMenuItem className="flex-col items-start">
            <div className="font-medium text-xs">{user?.name}</div>
            <div className="text-xs text-zinc-500">{user?.email}</div>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <SignOutButton />
          </DropdownMenuItem>
          {renderClearHistory()}
          {renderSettingsItems()}
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  return (
    <div className="flex items-center justify-between">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="px-2" variant="ghost">
            {user?.image ? (
              <Image
                alt="User profile image"
                className="size-6 select-none rounded-full ring-1 ring-zinc-100/10 transition-opacity duration-300 hover:opacity-80"
                height={24}
                src={`${user.image}&s=60`}
                width={24}
              />
            ) : (
              <div className="flex size-7 shrink-0 select-none items-center justify-center rounded-full bg-muted/50 font-medium text-muted-foreground text-xs uppercase">
                {user?.name ? getUserInitials(user?.name) : null}
              </div>
            )}
            <span className="ml-2 hidden lg:flex">{user?.name}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[220px]" sideOffset={8}>
          <DropdownMenuItem className="flex-col items-start">
            <div className="font-medium text-xs">{user?.name}</div>
            <div className="text-xs text-zinc-500">{user?.email}</div>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <SignOutButton />
          </DropdownMenuItem>
          {renderClearHistory()}
          {renderSettingsItems()}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
