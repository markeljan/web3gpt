import type { Metadata } from "next"

export const metadata: Metadata = {
  robots: { index: false },
  title: "Page not found",
}

const LINKS = [
  { description: "Chat with the agent", href: "/", label: "Home" },
  { description: "Every recorded deployment", href: "/contracts", label: "Contracts" },
  { description: "Overview for AI agents", href: "/llms.txt", label: "llms.txt" },
  { description: "How agents use the HTTP API", href: "/skill.md", label: "Skill guide" },
  { description: "Interactive API reference", href: "/api-docs", label: "API docs" },
  { description: "All public pages", href: "/sitemap.xml", label: "Sitemap" },
]

// Rendered with a real 404 status. Agents that land on a bad path need somewhere
// to go next, so this lists the entry points instead of a bare error.
export default function NotFound() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-16">
        <div>
          <h1 className="font-semibold text-2xl">Page not found</h1>
          <p className="mt-2 text-muted-foreground">There is nothing at this address. Try one of these instead:</p>
        </div>
        <ul className="flex flex-col gap-3">
          {LINKS.map(({ description, href, label }) => (
            <li key={href}>
              {/* Plain anchors: most targets are files, not app routes. */}
              <a className="font-medium underline underline-offset-4" href={href}>
                {label}
              </a>
              <span className="text-muted-foreground"> - {description}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
