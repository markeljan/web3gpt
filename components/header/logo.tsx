import Link from "next/link"
import { cn } from "@/lib/utils"

type LogoProps = {
  className?: string
  variant?: "default" | "mobile" | "large" | "xl"
}

type LogoTextProps = LogoProps & {
  children: React.ReactNode
}

// custom text with logo font not link
export const CustomLogoText = ({ className, variant = "default", children }: LogoTextProps) => (
  <span
    className={cn(
      "text-sm font-normal tracking-tight text-gray-600 dark:text-gray-400",
      variant === "mobile" && "text-base",
      variant === "large" && "text-xl",
      variant === "xl" && "text-2xl",
      className
    )}
  >
    {children}
  </span>
)

export function W3GPTLogo({ className, variant = "default" }: LogoProps) {
  return (
    <Link
      className={cn(
        "flex items-center gap-2 text-lg font-bold tracking-tight transition-opacity hover:opacity-80",
        variant === "mobile" && "text-xl",
        variant === "large" && "text-2xl",
        variant === "xl" && "text-3xl",
        className
      )}
      href="/"
    >
      <span className="text-foreground">
        Web3<span className="text-primary">GPT</span>
      </span>
    </Link>
  )
}
