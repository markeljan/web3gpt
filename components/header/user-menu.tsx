"use client"

import { ChevronsUpDown, LoaderCircle, LogOut, Mail, Monitor, Moon, Sun, Trash2 } from "lucide-react"
import Image from "next/image"
import { usePathname, useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { useEffect, useRef, useState, useTransition } from "react"
import { toast } from "sonner"
import { EarlyAccessDialog } from "@/components/early-access/early-access-card"
import { IconGitHub, IconTelegram, IconTwitter } from "@/components/icons"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { clearChatsAction } from "@/lib/actions/chat"
import { unsubscribeFromUpdatesAction } from "@/lib/actions/updates"
import { type AuthUser, signOut } from "@/lib/auth-client"
import { useUpdatesSubscription } from "@/lib/hooks/use-updates-subscription"
import { cn } from "@/lib/utils"

const THEMES = [
  { icon: Sun, label: "Light", value: "light" },
  { icon: Moon, label: "Dark", value: "dark" },
  { icon: Monitor, label: "System", value: "system" },
] as const

/** Typed to confirm deleting all chats, so it can't happen by a stray click. */
const DELETE_CONFIRMATION = "DELETE ALL CHAT HISTORY"

const COMMUNITY_LINKS = [
  { href: "https://x.com/w3gptai", icon: IconTwitter, label: "Follow on X" },
  { href: "https://t.me/w3gptai", icon: IconTelegram, label: "Telegram community" },
  { href: "https://github.com/markeljan/web3gpt", icon: IconGitHub, label: "GitHub" },
] as const

const WHITESPACE = /\s+/

const getUserInitials = (name: string) => {
  const [first = "", last] = name.trim().split(WHITESPACE)
  return (last ? `${first[0] ?? ""}${last[0] ?? ""}` : first.slice(0, 2)).toUpperCase()
}

/** GitHub avatars accept a size parameter; anything else is used as is. */
const getAvatarUrl = (image: string, size: number) => {
  try {
    const url = new URL(image)
    if (url.hostname.endsWith("githubusercontent.com")) {
      url.searchParams.set("s", String(size))
    }
    return url.toString()
  } catch {
    return image
  }
}

function UserAvatar({ user, className }: { user: AuthUser; className?: string }) {
  if (user.image) {
    return (
      <Image
        alt=""
        className={cn("size-8 shrink-0 select-none rounded-full ring-1 ring-border", className)}
        height={32}
        src={getAvatarUrl(user.image, 64)}
        width={32}
      />
    )
  }
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-8 shrink-0 select-none items-center justify-center rounded-full bg-muted font-medium text-muted-foreground text-xs",
        className
      )}
    >
      {user.name ? getUserInitials(user.name) : null}
    </span>
  )
}

type UserMenuProps = {
  user: AuthUser
  /** `sidebar`: full-width row with name and email. `collapsed`: avatar only. */
  variant?: "sidebar" | "collapsed"
}

export function UserMenu({ user, variant = "sidebar" }: UserMenuProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { setTheme, theme } = useTheme()
  const { hydrate, resetAccount, setSubscribed, subscribed, syncWithServer } = useUpdatesSubscription()
  const [updatesDialogOpen, setUpdatesDialogOpen] = useState(false)
  const [clearDialogOpen, setClearDialogOpen] = useState(false)
  const [deleteConfirmation, setDeleteConfirmation] = useState("")
  const deleteConfirmationRef = useRef<HTMLInputElement>(null)
  const canDeleteHistory = deleteConfirmation.trim() === DELETE_CONFIRMATION
  const [isClearing, startClearing] = useTransition()
  const [isSigningOut, startSigningOut] = useTransition()

  useEffect(() => {
    hydrate()
    syncWithServer()
  }, [hydrate, syncWithServer])

  const handleUpdatesChange = async (checked: boolean) => {
    if (checked) {
      setUpdatesDialogOpen(true)
      return
    }
    setSubscribed(false)
    try {
      // `undefined` means the session has expired.
      if (!(await unsubscribeFromUpdatesAction())) {
        throw new Error("not signed in")
      }
      toast.success("Unsubscribed from product updates")
    } catch {
      setSubscribed(true)
      toast.error("Couldn't unsubscribe. Please try again.")
    }
  }

  const handleSignOut = () => {
    startSigningOut(async () => {
      await signOut()
      resetAccount()
      router.push("/")
      router.refresh()
    })
  }

  const handleClearDialogChange = (open: boolean) => {
    if (isClearing) {
      return
    }
    setClearDialogOpen(open)
    // Start from an empty field every time the dialog opens.
    setDeleteConfirmation("")
  }

  const handleClearHistory = () => {
    if (!canDeleteHistory || isClearing) {
      return
    }
    startClearing(async () => {
      try {
        await clearChatsAction()
        setClearDialogOpen(false)
        setDeleteConfirmation("")
        toast.success("Chat history deleted")
        // The open chat no longer exists.
        if (pathname.startsWith("/chat/")) {
          router.push("/")
        }
        router.refresh()
      } catch {
        toast.error("Couldn't delete chat history. Please try again.")
      }
    })
  }

  const trigger =
    variant === "collapsed" ? (
      <Button aria-label={`Account menu for ${user.name}`} className="size-10 rounded-full p-0" variant="ghost">
        <UserAvatar user={user} />
      </Button>
    ) : (
      <Button
        aria-label={`Account menu for ${user.name}`}
        className="h-auto w-full justify-start gap-3 p-3 text-left font-normal hover:bg-accent/60 data-[state=open]:bg-accent/60"
        variant="ghost"
      >
        <UserAvatar user={user} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-sm">{user.name}</span>
          <span className="block truncate text-muted-foreground text-xs">{user.email}</span>
        </span>
        <ChevronsUpDown aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      </Button>
    )

  return (
    <>
      <DropdownMenu>
        {variant === "collapsed" ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="right">Account and settings</TooltipContent>
          </Tooltip>
        ) : (
          <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        )}

        <DropdownMenuContent
          align={variant === "collapsed" ? "end" : "start"}
          className="w-(--radix-dropdown-menu-trigger-width) min-w-60"
          side={variant === "collapsed" ? "right" : "top"}
          sideOffset={8}
        >
          <DropdownMenuLabel className="flex items-center gap-3 font-normal">
            <UserAvatar user={user} />
            <span className="min-w-0">
              <span className="block truncate font-medium text-sm">{user.name}</span>
              <span className="block truncate text-muted-foreground text-xs">{user.email}</span>
            </span>
          </DropdownMenuLabel>

          <DropdownMenuSeparator />
          <DropdownMenuLabel className="py-1 font-medium text-muted-foreground text-xs">Theme</DropdownMenuLabel>
          <DropdownMenuRadioGroup onValueChange={setTheme} value={theme}>
            {THEMES.map(({ icon: Icon, label, value }) => (
              // Keep the menu open so the change can be previewed.
              <DropdownMenuRadioItem key={value} onSelect={(event) => event.preventDefault()} value={value}>
                <Icon aria-hidden />
                {label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>

          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem checked={subscribed} onCheckedChange={handleUpdatesChange}>
            <Mail aria-hidden />
            Product updates
          </DropdownMenuCheckboxItem>

          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            {COMMUNITY_LINKS.map(({ href, icon: Icon, label }) => (
              <DropdownMenuItem asChild key={href}>
                <a href={href} rel="noopener noreferrer" target="_blank">
                  <Icon aria-hidden />
                  {label}
                </a>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>

          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-red-600 focus:bg-red-500/10 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400"
            onSelect={() => handleClearDialogChange(true)}
          >
            <Trash2 aria-hidden />
            Delete chat history
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={isSigningOut}
            onSelect={(event) => {
              event.preventDefault()
              handleSignOut()
            }}
          >
            {isSigningOut ? <LoaderCircle aria-hidden className="animate-spin" /> : <LogOut aria-hidden />}
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Dialogs live outside the menu so closing the menu doesn't unmount them. */}
      <EarlyAccessDialog onOpenChange={setUpdatesDialogOpen} open={updatesDialogOpen} />

      <AlertDialog onOpenChange={handleClearDialogChange} open={clearDialogOpen}>
        <AlertDialogContent
          onOpenAutoFocus={(event) => {
            // Start in the confirmation field rather than on Cancel.
            event.preventDefault()
            deleteConfirmationRef.current?.focus()
          }}
        >
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              handleClearHistory()
            }}
          >
            <AlertDialogHeader>
              <AlertDialogTitle>Delete all chat history?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently deletes every saved chat from our servers, including shared links. It can't be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="grid gap-2">
              <label className="text-sm" htmlFor="delete-history-confirmation">
                Type <span className="select-all font-mono font-semibold">{DELETE_CONFIRMATION}</span> to confirm.
              </label>
              <Input
                autoCapitalize="characters"
                autoComplete="off"
                autoCorrect="off"
                disabled={isClearing}
                id="delete-history-confirmation"
                onChange={(event) => setDeleteConfirmation(event.target.value)}
                ref={deleteConfirmationRef}
                spellCheck={false}
                value={deleteConfirmation}
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isClearing} type="button">
                Cancel
              </AlertDialogCancel>
              {/* A plain submit button: AlertDialogAction would close the dialog before the delete finishes. */}
              <Button disabled={!canDeleteHistory || isClearing} type="submit" variant="destructive">
                {isClearing ? <LoaderCircle aria-hidden className="mr-2 size-4 animate-spin" /> : null}
                Delete history
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
