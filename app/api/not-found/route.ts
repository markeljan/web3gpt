import { markdownNotFound } from "@/lib/not-found-markdown"

// Target of the proxy's markdown rewrite for unknown pages (see proxy.ts). Always a 404.
// After a rewrite the handler still sees the original URL, so its pathname is the missing page.
export const GET = (request: Request) => markdownNotFound(new URL(request.url).pathname)
