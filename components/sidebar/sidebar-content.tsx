import { LoginButton } from "@/components/header/login-button"
import { W3GPTLogo } from "@/components/header/logo"
import { Navigation } from "@/components/header/navigation"
import { UserMenu } from "@/components/header/user-menu"
import { SidebarAgents } from "@/components/sidebar/sidebar-agents"
import { SidebarList } from "@/components/sidebar/sidebar-list"
import { Separator } from "@/components/ui/separator"
import { getSession } from "@/lib/auth"
import { getChatList } from "@/lib/data/kv"

export async function SidebarContent() {
  const session = await getSession()
  const user = session?.user
  const chatList = await getChatList(user?.id)

  return (
    <div className="flex h-full flex-col">
      {/* Header Section */}
      <div className="shrink-0 p-6 pb-4">
        <W3GPTLogo className="mb-6" />

        {/* Navigation */}
        <div className="space-y-2">
          <Navigation variant="mobile" />
        </div>
      </div>

      <Separator className="shrink-0" />

      {/* Agents Section */}
      <div className="shrink-0 p-6 py-2">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="pointer-events-none select-none font-semibold text-muted-foreground text-xs uppercase tracking-wider">
            Agents
          </h3>
        </div>
        <div className="overflow-y-auto max-sm:max-h-[108px]">
          <SidebarAgents />
        </div>
      </div>

      <Separator className="shrink-0" />

      {/* Chat History Section - Scrollable */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-2">
        <div className="mb-3 flex shrink-0 items-center justify-between px-2">
          <h3 className="pointer-events-none select-none font-semibold text-muted-foreground text-xs uppercase tracking-wider">
            Chats
          </h3>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          {user ? (
            <SidebarList chatList={chatList} />
          ) : (
            <div className="flex h-20 items-center justify-center">
              <p className="text-muted-foreground text-sm">No chat history</p>
            </div>
          )}
        </div>
      </div>

      <Separator className="shrink-0" />

      {/* User Section - Bottom */}
      <div className="shrink-0 p-4">
        {user ? (
          <div className="overflow-hidden rounded-lg border bg-muted/50">
            <UserMenu user={user} variant="sidebar" />
          </div>
        ) : (
          <div className="rounded-lg border bg-muted/50 p-3">
            <LoginButton
              className="w-full justify-start"
              showGithubIcon={true}
              text="Sign in to continue"
              variant="ghost"
            />
          </div>
        )}
      </div>
    </div>
  )
}
