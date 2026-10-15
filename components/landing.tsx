"use client"

import Player from "react-lottie-player"
import { EarlyAccessCard } from "@/components/early-access/early-access-card"
import { CustomLogoText, W3GPTLogo } from "@/components/header/logo"

type LandingProps = {
  userId?: string
  disableAnimations?: boolean
}

export function Landing({ userId, disableAnimations }: LandingProps) {
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

      <EarlyAccessCard className="mb-4" userId={userId} />
    </>
  )
}
