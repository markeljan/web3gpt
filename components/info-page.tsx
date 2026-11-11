import type { ReactNode } from "react"

/** Layout for plain text pages (about, privacy): one readable column. */
export function InfoPage({ children, title, updated }: { children: ReactNode; title: string; updated?: string }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <article className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-12 text-sm leading-relaxed">
        <header>
          <h1 className="text-2xl font-semibold">{title}</h1>
          {updated ? <p className="text-muted-foreground mt-1">Last updated {updated}</p> : null}
        </header>
        {children}
      </article>
    </div>
  )
}

export function InfoSection({ children, id, title }: { children: ReactNode; id?: string; title: string }) {
  return (
    <section className="flex flex-col gap-3" id={id}>
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  )
}

export const linkClass = "underline underline-offset-4"
export const listClass = "list-disc space-y-1 pl-5"
