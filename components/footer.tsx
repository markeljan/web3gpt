import { ExternalLink } from "@/components/external-link"
import { cn } from "@/lib/utils"

export function FooterText({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p className={cn("text-muted-foreground px-2 text-center text-xs leading-normal", className)} {...props}>
      Made by <ExternalLink href="https://x.com/soko_eth">soko.eth</ExternalLink> with{" "}
      <ExternalLink href="https://github.com/vercel/ai">AI-SDK</ExternalLink>.
    </p>
  )
}
