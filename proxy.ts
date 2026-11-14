import { type NextRequest, NextResponse } from "next/server"
import { prefersMarkdown } from "@/lib/accept"
import { isUnknownPage } from "@/lib/not-found-markdown"

// Content negotiation for agents, only when they send `Accept: text/markdown`:
// - the homepage returns the markdown guide instead of the HTML app;
// - GET and HEAD for a path with no page use the markdown 404 handler.
// Both carry `Vary: Accept` so a cache never serves them to a browser. The HTML variant
// needs nothing: it is `no-store` (the layout is dynamic), and Next overwrites Vary on
// app pages anyway.
export function proxy(request: NextRequest) {
  if (!prefersMarkdown(request.headers.get("accept"))) {
    return NextResponse.next()
  }
  const { pathname } = request.nextUrl
  if (pathname === "/") {
    const response = NextResponse.rewrite(new URL("/skill.md", request.url))
    response.headers.set("Vary", "Accept")
    return response
  }
  if ((request.method === "GET" || request.method === "HEAD") && isUnknownPage(pathname)) {
    const target = new URL("/api/not-found", request.url)
    const response = NextResponse.rewrite(target)
    response.headers.set("Vary", "Accept")
    return response
  }
  return NextResponse.next()
}

// Skip the API, Next internals and anything with a file extension (public files).
export const config = {
  matcher: ["/", "/((?!api/|_next/|.*\\..*).+)"],
}
