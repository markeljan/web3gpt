import Link from "next/link"
import { ConnectButton } from "@/components/connect-button"
import { ModelBadge } from "@/components/header/model-badge"
import { MetisTeaser } from "@/components/metis-teaser"
import { Sidebar } from "@/components/sidebar/sidebar"
import { SidebarContent } from "@/components/sidebar/sidebar-content"

export const Header = () => {
  return (
    <header className="sticky top-0 z-50 flex h-16 w-full shrink-0 items-center justify-between border-b bg-background/95 px-4 backdrop-blur-sm supports-backdrop-filter:bg-background/60">
      <div className="flex min-w-0 items-center gap-4">
        {/* Mobile Sidebar */}
        <div className="lg:hidden">
          <Sidebar>
            <SidebarContent />
          </Sidebar>
        </div>

        {/* Model Badge - Desktop only */}
        <div className="flex min-w-0 items-center gap-3">
          <ModelBadge />
          <Link
            className="whitespace-nowrap text-[11px] text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline sm:text-xs"
            href="/skill.md"
            rel="noreferrer"
            target="_blank"
          >
            Agents: install our skill.md
          </Link>
        </div>
      </div>

      {/* Right Actions */}
      <div className="flex items-center justify-end space-x-2">
        <MetisTeaser />
        <ConnectButton />
      </div>
    </header>
  )
}
