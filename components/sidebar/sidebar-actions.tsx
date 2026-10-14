"use client"

import Link from "next/link"
import { useCallback, useState, useTransition } from "react"
import { toast } from "sonner"
import { IconShare, IconSpinner, IconTrash, IconUsers } from "@/components/icons"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { badgeVariants } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { deleteChatAction, shareChatAction } from "@/lib/actions/chat"
import { APP_URL } from "@/lib/config"
import { useCopyToClipboard } from "@/lib/hooks/use-copy-to-clipboard"
import type { DbChatListItem } from "@/lib/types"
import { cn, formatDate } from "@/lib/utils"

type SidebarActionsProps = {
  chat: DbChatListItem
}

const SHARE_DELAY = 500

export function SidebarActions({ chat }: SidebarActionsProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [shareDialogOpen, setShareDialogOpen] = useState(false)
  const [isDeletePending, startDeleteTransition] = useTransition()
  const [isSharePending, startShareTransition] = useTransition()
  const { copyToClipboard } = useCopyToClipboard({ timeout: 2000 })

  const copyShareLink = useCallback(() => {
    copyToClipboard(`${APP_URL}/share/${chat.id}`)
    setShareDialogOpen(false)
    toast.success("Share link copied to clipboard", {
      icon: "📋",
      style: {
        background: "#333",
        borderRadius: "10px",
        color: "#fff",
        fontSize: "14px",
      },
    })
  }, [chat.id, copyToClipboard])

  return (
    <>
      <div className="space-x-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button className="size-6 p-0 hover:bg-background" onClick={() => setShareDialogOpen(true)} variant="ghost">
              <IconShare />
              <span className="sr-only">Share</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Share chat</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              className="size-6 p-0 hover:bg-background"
              disabled={isDeletePending}
              onClick={() => setDeleteDialogOpen(true)}
              variant="ghost"
            >
              <IconTrash />
              <span className="sr-only">Delete</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Delete chat</TooltipContent>
        </Tooltip>
      </div>
      <Dialog onOpenChange={setShareDialogOpen} open={shareDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share link to chat</DialogTitle>
            <DialogDescription>Anyone with the URL will be able to view the shared chat.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1 rounded-md border p-4 text-sm">
            <div className="font-medium">{chat.title}</div>
            <div className="text-muted-foreground">{formatDate(chat.createdAt)}</div>
          </div>
          <DialogFooter className="items-center">
            {chat.published ? (
              <Link
                className={cn(badgeVariants({ variant: "secondary" }), "mr-auto")}
                href={`/share/${chat.id}`}
                rel="noopener noreferrer"
                target="_blank"
              >
                <IconUsers className="mr-2" />
                {`/share/${chat.id}`}
              </Link>
            ) : null}
            <Button
              disabled={isSharePending}
              onClick={() => {
                startShareTransition(async () => {
                  if (chat.published) {
                    await new Promise((resolve) => setTimeout(resolve, SHARE_DELAY))
                    copyShareLink()
                    return
                  }

                  const shared = await shareChatAction(chat.id)
                  if (!shared) {
                    toast.error("Could not share this chat")
                    return
                  }
                  copyShareLink()
                })
              }}
            >
              {isSharePending ? (
                <>
                  <IconSpinner className="mr-2 animate-spin" />
                  Copying...
                </>
              ) : (
                "Copy link"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog onOpenChange={setDeleteDialogOpen} open={deleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete your chat message and remove your data from our servers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletePending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeletePending}
              onClick={(event) => {
                event.preventDefault()
                startDeleteTransition(async () => {
                  await deleteChatAction(chat.id)
                  setDeleteDialogOpen(false)
                })
              }}
            >
              {isDeletePending ? <IconSpinner className="mr-2 animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
