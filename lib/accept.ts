/** q-value of `type` in an Accept header: 0 when absent. Wildcards are ignored on purpose. */
const qualityOf = (accept: string, type: string): number => {
  for (const part of accept.split(",")) {
    const [mediaType, ...params] = part.trim().split(";")
    if (mediaType.trim().toLowerCase() !== type) {
      continue
    }
    const q = params.map((param) => param.trim()).find((param) => param.startsWith("q="))
    const value = q ? Number.parseFloat(q.slice(2)) : 1
    return Number.isFinite(value) ? value : 0
  }
  return 0
}

/**
 * True when the client explicitly asks for markdown at least as much as HTML.
 * Browsers never list text/markdown, so they keep getting the app.
 */
export const prefersMarkdown = (accept: string | null): boolean => {
  if (!accept) {
    return false
  }
  const markdown = qualityOf(accept, "text/markdown")
  return markdown > 0 && markdown >= qualityOf(accept, "text/html")
}
