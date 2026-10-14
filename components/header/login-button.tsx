"use client"

import { useState } from "react"
import { IconGitHub, IconSpinner } from "@/components/icons"
import { Button, type ButtonProps } from "@/components/ui/button"
import { signIn } from "@/lib/auth-client"
import { cn } from "@/lib/utils"

interface LoginButtonProps extends ButtonProps {
  showGithubIcon?: boolean
  text?: string
}

export function LoginButton({
  text = "Login with GitHub",
  showGithubIcon = true,
  className,
  ...props
}: LoginButtonProps) {
  const [isLoading, setIsLoading] = useState(false)
  return (
    <Button
      className={cn(className)}
      disabled={isLoading}
      onClick={() => {
        setIsLoading(true)
        signIn.social({ callbackURL: "/", provider: "github" })
      }}
      variant="outline"
      {...props}
    >
      {showGithubIcon && isLoading ? <IconSpinner className="mr-2 animate-spin" /> : null}
      {showGithubIcon && !isLoading ? <IconGitHub className="mr-2" /> : null}
      {/* biome-ignore lint/suspicious/noLeakedRender: `text` is the button label, a string that is meant to render */}
      {!showGithubIcon && isLoading ? <IconSpinner className="mr-1 animate-spin" /> : text}
    </Button>
  )
}
