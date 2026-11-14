/** Top-level path segments that exist as pages or files. Anything else is a 404. */
export const KNOWN_SEGMENTS: ReadonlySet<string> = new Set([
  "about",
  "api-docs",
  "chat",
  "contact",
  "contracts",
  "privacy",
  "share",
])

/** True when `pathname` is not served by any page (and so would render the 404 page). */
export const isUnknownPage = (pathname: string): boolean => {
  const segment = pathname.split("/").find(Boolean)
  return Boolean(segment) && !KNOWN_SEGMENTS.has(segment as string)
}

/** Markdown error body with a real 404 status, for agents that send `Accept: text/markdown`. */
export const markdownNotFound = (pathname: string): Response => {
  const shown = pathname.replace(/[^\w\-./~%]/gu, "").slice(0, 200) || "/"
  const body = `# Not found

There is nothing at \`${shown}\` on Web3GPT.

## Where to go next

- [Home](/): chat with the agent
- [llms.txt](/llms.txt): overview for AI agents
- [Skill guide](/skill.md): how agents use the HTTP API
- [API reference](/api-docs): interactive API docs
- [Sitemap](/sitemap.xml): all public pages
- [Contact](/contact): report a problem
`
  return new Response(body, {
    headers: { "Content-Type": "text/markdown; charset=utf-8", Vary: "Accept" },
    status: 404,
  })
}
