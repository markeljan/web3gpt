import "@/app/globals.css"
import { Analytics } from "@vercel/analytics/react"
import type { Metadata, Viewport } from "next"
import { JetBrains_Mono as FontMono, Inter as FontSans } from "next/font/google"
import { cookies } from "next/headers"
import { ThemeProvider } from "next-themes"
import type { ReactNode } from "react"
import { Header } from "@/components/header/header"
import { MiniAppInitializer } from "@/components/miniapp-initializer"
import { Web3Provider } from "@/components/providers/web3-provider"
import { PermanentSidebar } from "@/components/sidebar/permanent-sidebar"
import { SidebarContent } from "@/components/sidebar/sidebar-content"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { getSession } from "@/lib/auth"
import { APP_URL } from "@/lib/config"
import { cn } from "@/lib/utils"

const fontSans = FontSans({
  subsets: ["latin"],
  variable: "--font-inter",
})

const fontMono = FontMono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
})

const STRINGIFIED_MINIAPP = JSON.stringify({
  button: {
    action: {
      name: "Web3GPT",
      splashBackgroundColor: "#262626",
      splashImageUrl: `${APP_URL}/assets/web3gpt.png`,
      type: "launch_frame",
      url: APP_URL,
    },
    title: "🚀 Launch Web3GPT",
  },
  imageUrl: `${APP_URL}/opengraph-image.png`,
  version: "1",
})

export const metadata: Metadata = {
  authors: [{ name: "Markeljan" }],
  creator: "Markeljan",
  description: "Deploy smart contracts, create AI Agents, do more onchain with AI.",
  icons: {
    apple: "/apple-touch-icon.png",
    icon: "/assets/web3gpt.png",
    shortcut: "/favicon-16x16.png",
  },
  keywords: ["smart contracts", "AI", "web3", "blockchain", "ethereum", "solidity", "development"],
  metadataBase: new URL(APP_URL),
  openGraph: {
    description: "Deploy smart contracts, create AI Agents, do more onchain with AI.",
    images: [
      {
        alt: "Web3GPT",
        height: 630,
        url: `${APP_URL}/opengraph-image.png`,
        width: 1200,
      },
    ],
    locale: "en_US",
    siteName: "Web3GPT",
    title: "Web3GPT",
    type: "website",
    url: APP_URL,
  },
  other: {
    "fc:frame": STRINGIFIED_MINIAPP,
    "fc:miniapp": STRINGIFIED_MINIAPP,
  },
  publisher: "W3GPT",
  robots: {
    follow: true,
    googleBot: {
      follow: true,
      index: true,
    },
    index: true,
  },
  title: {
    default: "Web3GPT",
    template: "%s - Web3GPT",
  },
  twitter: {
    card: "summary_large_image",
    creator: "@soko_eth",
    description: "Deploy smart contracts, create AI Agents, do more onchain with AI.",
    images: [`${APP_URL}/twitter-image.png`],
    site: "@w3gptai",
    title: "Web3GPT",
  },
}

// The root layout resolves the session from request headers on every render,
// so no route under it can be prerendered at build time.
export const dynamic = "force-dynamic"

export const viewport: Viewport = {
  themeColor: [
    { color: "white", media: "(prefers-color-scheme: light)" },
    { color: "black", media: "(prefers-color-scheme: dark)" },
  ],
}

export default async function Layout({ children }: { children: ReactNode }) {
  const [session, cookieStore] = await Promise.all([getSession(), cookies()])
  const cookiesValue = cookieStore.get("cookie")?.value

  return (
    <html className={cn(fontSans.variable, fontMono.variable)} lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableColorScheme
          enableSystem
          storageKey="preffered-theme"
        >
          <TooltipProvider>
            <Web3Provider cookiesValue={cookiesValue}>
              <MiniAppInitializer />
              <div className="flex h-screen overflow-hidden">
                <PermanentSidebar user={session?.user}>
                  <SidebarContent />
                </PermanentSidebar>
                <div className="flex min-w-0 flex-1 flex-col">
                  <Header />
                  {/* Routes own their own scroll container so chat can pin to the bottom. */}
                  <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">{children}</main>
                </div>
              </div>
              <Toaster
                toastOptions={{
                  duration: 2000,
                }}
              />
            </Web3Provider>
          </TooltipProvider>
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  )
}
