/** Exact single-segment pages, including the API docs rewrite. */
export const KNOWN_SEGMENTS: ReadonlySet<string> = new Set(["about", "api-docs", "contact", "contracts", "privacy"])

/** True when `pathname` is not served by any page (and so would render the 404 page). */
export const isUnknownPage = (pathname: string): boolean => {
  if (pathname === "/") {
    return false
  }
  const segments = pathname.slice(1).split("/")
  if (segments.length === 1) {
    return !KNOWN_SEGMENTS.has(segments[0])
  }
  return !(segments.length === 2 && (segments[0] === "chat" || segments[0] === "share") && Boolean(segments[1]))
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
