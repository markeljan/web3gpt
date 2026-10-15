"use client"

import { Check, LoaderCircle } from "lucide-react"
import { useId, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { subscribeToUpdatesAction } from "@/lib/actions/updates"
import { isValidEmail, normalizeEmail } from "@/lib/email"
import { useUpdatesSubscription } from "@/lib/hooks/use-updates-subscription"
import { cn } from "@/lib/utils"

type EarlyAccessFormProps = {
  className?: string
  /** Prefilled address, e.g. the signed-in user's own email. */
  defaultEmail?: string | null
  onSubscribed?: (email: string) => void
}

/**
 * Email sign-up for product updates. Validates on the client for instant
 * feedback, but the server action is the authority and its error is shown as is.
 */
export function EarlyAccessForm({ className, defaultEmail, onSubscribed }: EarlyAccessFormProps) {
  const inputId = useId()
  const errorId = useId()
  const [email, setEmail] = useState(defaultEmail ?? "")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const setSubscribed = useUpdatesSubscription((state) => state.setSubscribed)

  // A prefill that arrives after mount (the account lookup is async) fills the
  // field only if the visitor hasn't started typing.
  const [prefill, setPrefill] = useState(defaultEmail)
  if (defaultEmail !== prefill) {
    setPrefill(defaultEmail)
    if (!email && defaultEmail) {
      setEmail(defaultEmail)
    }
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isPending) {
      return
    }
    const normalized = normalizeEmail(email)
    if (!isValidEmail(normalized)) {
      setError("Enter a valid email address.")
      return
    }
    setError(null)
    startTransition(async () => {
      try {
        const result = await subscribeToUpdatesAction(normalized)
        if (!result.ok) {
          setError(result.error)
          return
        }
        setSubscribed(true, result.email)
        onSubscribed?.(result.email)
      } catch {
        setError("Couldn't reach the server. Check your connection and try again.")
      }
    })
  }

  return (
    <form className={cn("w-full", className)} noValidate onSubmit={handleSubmit}>
      <label className="sr-only" htmlFor={inputId}>
        Email address
      </label>
      <div className="flex w-full flex-col gap-2 sm:flex-row">
        <Input
          aria-describedby={error ? errorId : undefined}
          aria-invalid={error ? true : undefined}
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect="off"
          className={cn("h-10 min-w-0 flex-1", error && "border-destructive focus-visible:ring-destructive")}
          disabled={isPending}
          id={inputId}
          inputMode="email"
          maxLength={254}
          name="email"
          onChange={(event) => {
            setEmail(event.target.value)
            if (error) {
              setError(null)
            }
          }}
          placeholder="you@example.com"
          spellCheck={false}
          type="email"
          value={email}
        />
        <Button className="h-10 shrink-0 sm:w-auto" disabled={isPending} type="submit">
          {isPending ? <LoaderCircle aria-hidden className="mr-2 size-4 animate-spin" /> : null}
          {isPending ? "Joining…" : "Join the list"}
        </Button>
      </div>
      <p
        aria-live="polite"
        className={cn("mt-2 min-h-4 text-left text-xs", error ? "text-destructive" : "text-muted-foreground")}
        id={errorId}
      >
        {error ?? "Occasional emails about new features. No spam."}
      </p>
    </form>
  )
}

export function EarlyAccessSuccess({ email, className }: { email: string | null; className?: string }) {
  return (
    <div className={cn("flex items-start gap-3 text-left", className)} role="status">
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Check aria-hidden className="size-3.5" />
      </span>
      <div className="min-w-0">
        <p className="font-medium text-sm">You're on the list</p>
        <p className="text-muted-foreground text-xs">
          {email ? (
            <>
              We'll email <span className="break-all font-medium text-foreground">{email}</span> when there's news.
            </>
          ) : (
            "We'll email you when there's news."
          )}
        </p>
      </div>
    </div>
  )
}
