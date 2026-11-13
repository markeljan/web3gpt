import { expect, test } from "bun:test"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const root = resolve(import.meta.dir, "..")
const nextLinkImport = /\bfrom\s*["']next\/link["']/u
const linkHref = /<Link\b[^>]*?\bhref\s*=\s*(?:["'](?<direct>\/[^"']*)["']|\{\s*["'](?<expression>\/[^"']*)["']\s*\})/gu
const suffix = /[?#]/u

function fileHrefs(source: string): string[] {
  if (!nextLinkImport.test(source)) {
    return []
  }
  return Array.from(source.matchAll(linkHref), (match) => match.groups?.direct ?? match.groups?.expression ?? "")
}

function isPublicFile(href: string): boolean {
  return (
    !href.startsWith("//") &&
    (statSync(join(root, "public", href.split(suffix)[0]), { throwIfNoEntry: false })?.isFile() ?? false)
  )
}

function scan(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      return scan(path)
    }
    if (!entry.name.endsWith(".tsx")) {
      return []
    }
    return fileHrefs(readFileSync(path, "utf8"))
      .filter(isPublicFile)
      .map((href) => `${relative(root, path)}: ${href}`)
  })
}

test("Next Link never targets a public file", () => {
  expect(["app", "components"].flatMap((directory) => scan(join(root, directory)))).toEqual([])
})

test("recognizes literal href syntax across multiple lines", () => {
  const source = `import Link from "next/link"
    <Link href="/skill.md" />
    <Link
      className="example"
      href={ '/openapi.json?download=1#docs' }
    />
    <Link href={'/skill.md#install'} />
    <Link href="/" />
    <Link href={dynamic} />
    <a href="/skill.md" />
    <Link href="https://example.com/skill.md" />`
  expect(fileHrefs(source)).toEqual(["/skill.md", "/openapi.json?download=1#docs", "/skill.md#install", "/"])
  expect(fileHrefs('<Link href="/skill.md" />')).toEqual([])
})

test("distinguishes public files from directories, routes and external URLs", () => {
  for (const href of ["/skill.md", "/skill.md?download=1#install", "/openapi.json#docs"]) {
    expect(isPublicFile(href)).toBeTrue()
  }
  for (const href of ["/", "/?a=agent", "/contracts", "/missing-file.md", "//example.com/skill.md"]) {
    expect(isPublicFile(href)).toBeFalse()
  }
})
