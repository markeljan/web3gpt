import { type NextRequest, NextResponse } from "next/server"
import { prefersMarkdown } from "@/lib/accept"

// Content negotiation for agents: `Accept: text/markdown` on the homepage gets the
// markdown guide instead of the HTML app. The markdown variant carries
// `Vary: Accept` so a cache never serves it to a browser. The HTML variant needs
// nothing: it is `no-store` (the layout is dynamic), and Next overwrites Vary on
// app pages anyway.
export function proxy(request: NextRequest) {
  if (!prefersMarkdown(request.headers.get("accept"))) {
    return NextResponse.next()
  }
  const response = NextResponse.rewrite(new URL("/skill.md", request.url))
  response.headers.set("Vary", "Accept")
  return response
}

export const config = {
  matcher: "/",
}
