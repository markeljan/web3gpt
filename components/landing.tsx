"use client"

import { useEffect, useState } from "react"
import Player from "react-lottie-player"
import { toast } from "sonner"
import { CustomLogoText, W3GPTLogo } from "@/components/header/logo"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { getUserFieldAction, storeEmailAction } from "@/lib/actions/chat"
import { useIsClient } from "@/lib/hooks/use-is-client"
import { useLocalStorage } from "@/lib/hooks/use-local-storage"
import { isValidEmail } from "@/lib/utils"

type LandingProps = {
  userId?: string
  disableAnimations?: boolean
}

export function Landing({ userId, disableAnimations }: LandingProps) {
  const [validationError, setValidationError] = useState<string | null>(null)
  const [email, setEmail] = useState("")
  const [localIsSubscribed, setLocalIsSubscribed] = useLocalStorage("email_subscribed", false)
  const isClient = useIsClient()

  useEffect(() => {
    const fetchIsEmailSubscribed = async () => {
      const backendIsSubscribed = await getUserFieldAction("email_subscribed")
      if (!!backendIsSubscribed === true) {
        setLocalIsSubscribed(true)
      }
    }

    if (localIsSubscribed !== true && userId && isClient) {
      fetchIsEmailSubscribed()
    }
  }, [localIsSubscribed, setLocalIsSubscribed, userId, isClient])

  async function handleSubscribe(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!isValidEmail(email)) {
      setValidationError("Please enter a valid email")
      return
    }
    setValidationError(null)
    await storeEmailAction(email)
    setLocalIsSubscribed(true)
    setEmail("")
    toast.success("Thanks for subscribing!")
  }

  return (
    <>
      <div className="pointer-events-none mx-auto mb-4 flex max-w-2xl select-none flex-col p-4 py-8 text-center">
        <div className="mb-6 flex items-center justify-center gap-3 max-sm:flex-col">
          <W3GPTLogo variant="xl" />
          <CustomLogoText variant="xl">Ready, Set, Deploy</CustomLogoText>
        </div>

        {/* Stacked on phones: three columns in 375px wraps mid-phrase. */}
        <div className="mx-auto grid w-full max-w-sm grid-cols-1 gap-3 sm:max-w-none sm:grid-cols-3">
          <div className="flex items-center gap-3">
            <Player
              className="size-8 shrink-0"
              direction={-1}
              loop={false}
              path="/lotties/puzzle.json"
              play={!disableAnimations}
              speed={0.5}
            />
            <div className="text-left">
              <h3 className="font-medium text-sm">Generate</h3>
              <p className="text-gray-600 text-xs dark:text-gray-400">Prompt smart contracts</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Player
              className="size-8 shrink-0"
              loop={false}
              path="/lotties/clock.json"
              play={!disableAnimations}
              speed={0.5}
            />
            <div className="text-left">
              <h3 className="font-medium text-sm">Speed up</h3>
              <p className="text-gray-600 text-xs dark:text-gray-400">Skip the boilerplate</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Player
              className="size-8 shrink-0"
              direction={1}
              loop={false}
              path="/lotties/globe.json"
              play={!disableAnimations}
              speed={0.5}
            />
            <div className="text-left">
              <h3 className="font-medium text-sm">Deploy</h3>
              <p className="text-gray-600 text-xs dark:text-gray-400">Directly from chat</p>
            </div>
          </div>
        </div>
      </div>

      {isClient && localIsSubscribed === false ? (
        <div className="mx-auto mb-4 max-w-2xl rounded-lg border border-gray-600/20 bg-background/50 p-4 text-center dark:border-gray-600/30">
          <h3 className="mb-2 font-medium">Early Access</h3>
          <p className="mb-3 text-gray-600 text-sm dark:text-gray-400">Get updates and early access to features</p>
          <form className="flex justify-center gap-2" onSubmit={handleSubscribe}>
            <Input
              className="h-9 w-48 text-sm"
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Your email"
              type="text"
              value={email}
            />
            <Button className="h-9" size="sm" type="submit">
              Send
            </Button>
          </form>
          {validationError ? (
            <p className="mt-2 text-red-500 text-xs">{validationError}</p>
          ) : (
            <p className="mt-2 text-gray-400 text-xs">No spam, promise :)</p>
          )}
        </div>
      ) : null}
    </>
  )
}
