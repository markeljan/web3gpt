"use client"

import { X } from "lucide-react"
import { useEffect, useState } from "react"
import { EarlyAccessForm, EarlyAccessSuccess } from "@/components/early-access/early-access-form"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useUpdatesSubscription } from "@/lib/hooks/use-updates-subscription"
import { cn } from "@/lib/utils"

/**
 * The sign-up card under the landing hero. Shown until the visitor subscribes or
 * dismisses it; after subscribing it confirms in place instead of vanishing.
 */
export function EarlyAccessCard({ userId, className }: { userId?: string; className?: string }) {
  const { dismiss, dismissed, email, hydrate, hydrated, subscribed, suggestedEmail, syncWithServer } =
    useUpdatesSubscription()
  // Subscribing in this card keeps the confirmation visible for the rest of the visit.
  const [justSubscribed, setJustSubscribed] = useState(false)

  useEffect(() => {
    hydrate()
    if (userId) {
      syncWithServer()
    }
  }, [hydrate, syncWithServer, userId])

  if (!hydrated || dismissed || (subscribed && !justSubscribed)) {
    return null
  }

  return (
    <section
      aria-labelledby="early-access-title"
      className={cn(
        "fade-in slide-in-from-bottom-2 relative mx-auto w-full max-w-xl animate-in rounded-xl border bg-card/60 p-4 text-left shadow-xs duration-300 sm:p-5",
        className
      )}
    >
      <Button
        aria-label={justSubscribed ? "Close" : "Dismiss early access sign-up"}
        className="absolute top-2 right-2 size-7 text-muted-foreground hover:text-foreground"
        onClick={dismiss}
        size="icon"
        variant="ghost"
      >
        <X className="size-4" />
      </Button>

      {justSubscribed ? (
        <EarlyAccessSuccess className="pr-8" email={email} />
      ) : (
        <>
          <div className="mb-3 pr-8">
            <h2 className="font-semibold text-sm" id="early-access-title">
              Get early access
            </h2>
            <p className="text-muted-foreground text-sm">Be first to try new agents, chains and features.</p>
          </div>
          <EarlyAccessForm defaultEmail={suggestedEmail} onSubscribed={() => setJustSubscribed(true)} />
        </>
      )}
    </section>
  )
}

/** The same sign-up in a dialog, opened from the user menu. */
export function EarlyAccessDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { email, subscribed, suggestedEmail } = useUpdatesSubscription()

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Product updates</DialogTitle>
          <DialogDescription>Get early access to new agents, chains and features.</DialogDescription>
        </DialogHeader>
        {subscribed ? <EarlyAccessSuccess email={email} /> : <EarlyAccessForm defaultEmail={suggestedEmail} />}
      </DialogContent>
    </Dialog>
  )
}
