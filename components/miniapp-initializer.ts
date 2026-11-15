"use client"

import { sdk } from "@farcaster/miniapp-sdk"
import { useEffect } from "react"

export const MiniAppInitializer = (): React.ReactNode => {
  useEffect(() => {
    sdk.actions.ready().catch(() => {
      console.warn("Farcaster host readiness could not be confirmed")
    })
  }, [])

  return null
}
