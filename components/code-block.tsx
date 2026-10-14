"use client"

import { generateId } from "ai"
import { useTheme } from "next-themes"
import { memo, startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import { coldarkCold, coldarkDark } from "react-syntax-highlighter/dist/cjs/styles/prism"
import { DeployContractButton } from "@/components/deploy-contract-button"
import { IconCheck, IconCopy, IconDownload } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { normalizeCodeLanguage } from "@/lib/code-language"
import { useCopyToClipboard } from "@/lib/hooks/use-copy-to-clipboard"
import { useIsClient } from "@/lib/hooks/use-is-client"

const PROGRAMMING_LANGUAGES: Record<string, string> = {
  c: ".c",
  "c#": ".cs",
  "c++": ".cpp",
  clarity: ".clar",
  cpp: ".cpp",
  css: ".css",
  go: ".go",
  haskell: ".hs",
  html: ".html",
  java: ".java",
  javascript: ".js",
  kotlin: ".kt",
  lua: ".lua",
  "objective-c": ".m",
  perl: ".pl",
  php: ".php",
  python: ".py",
  ruby: ".rb",
  rust: ".rs",
  scala: ".scala",
  shell: ".sh",
  solidity: ".sol",
  sql: ".sql",
  swift: ".swift",
  typescript: ".ts",
}

const HIGHLIGHT_UPDATE_INTERVAL_MS = 150

type CodeBlockProps = {
  language: string
  isStreaming?: boolean
  value: string
}

export const CodeBlock = memo(({ language, isStreaming = false, value }: CodeBlockProps) => {
  const isClient = useIsClient()
  const { resolvedTheme } = useTheme()
  const { isCopied, copyToClipboard } = useCopyToClipboard({ timeout: 2000 })
  const [highlightedValue, setHighlightedValue] = useState(value)
  const lastHighlightAtRef = useRef(0)
  const latestValueRef = useRef(value)
  const pendingHighlightRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const normalizedLanguage = normalizeCodeLanguage(language, value)
  const languageLabel = normalizedLanguage || language || "code"

  const isDarkMode = isClient ? resolvedTheme === "dark" : true

  useEffect(() => {
    latestValueRef.current = value

    const commitHighlight = () => {
      pendingHighlightRef.current = null
      lastHighlightAtRef.current = Date.now()
      startTransition(() => {
        setHighlightedValue(latestValueRef.current)
      })
    }

    if (!isStreaming) {
      if (pendingHighlightRef.current) {
        clearTimeout(pendingHighlightRef.current)
        pendingHighlightRef.current = null
      }
      commitHighlight()
      return
    }

    const elapsed = Date.now() - lastHighlightAtRef.current
    if (elapsed >= HIGHLIGHT_UPDATE_INTERVAL_MS) {
      commitHighlight()
      return
    }

    if (!pendingHighlightRef.current) {
      pendingHighlightRef.current = setTimeout(commitHighlight, HIGHLIGHT_UPDATE_INTERVAL_MS - elapsed)
    }
  }, [isStreaming, value])

  useEffect(
    () => () => {
      if (pendingHighlightRef.current) {
        clearTimeout(pendingHighlightRef.current)
      }
    },
    []
  )

  const memoizedHighlighter = useMemo(
    () => (
      <SyntaxHighlighter
        codeTagProps={{
          style: {
            fontFamily: "var(--font-mono)",
            fontSize: "0.9rem",
          },
        }}
        customStyle={{
          background: "transparent",
          margin: 0,
          // Long Solidity lines must scroll inside the block rather than clip,
          // which matters most on phones. Don't rely on the prism theme for it.
          overflowX: "auto",
          padding: "1.5rem 1rem",
          width: "100%",
        }}
        language={normalizedLanguage || undefined}
        PreTag="div"
        style={isDarkMode ? coldarkDark : coldarkCold}
      >
        {highlightedValue}
      </SyntaxHighlighter>
    ),
    [highlightedValue, isDarkMode, normalizedLanguage]
  )

  const downloadAsFile = useCallback(() => {
    if (typeof window === "undefined") {
      return
    }
    const fileExtension = PROGRAMMING_LANGUAGES[normalizedLanguage] || ".file"
    const suggestedFileName = `web3gpt-${generateId()}${fileExtension}`
    // biome-ignore lint/suspicious/noAlert: intentional use of prompt for simple filename input
    const fileName = window.prompt("Enter file name", suggestedFileName)

    if (!fileName) {
      return
    }

    const blob = new Blob([value], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.download = fileName
    link.href = url
    link.style.display = "none"
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }, [value, normalizedLanguage])

  const renderDeployButton = useCallback(() => {
    if (normalizedLanguage === "solidity") {
      return <DeployContractButton disabled={isStreaming} sourceCode={value} />
    }
    return null
  }, [isStreaming, normalizedLanguage, value])

  return (
    <div className="relative w-full bg-muted/95 font-sans dark:bg-muted/50">
      <div className="flex w-full items-center justify-between border-b bg-secondary-foreground/40 px-6 py-3 pr-4 dark:bg-secondary-foreground/10">
        <span className="text-xs lowercase dark:text-secondary-foreground">{languageLabel}</span>
        <div className="flex items-center space-x-1">
          {renderDeployButton()}
          <Button
            className="focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0"
            onClick={downloadAsFile}
            size="icon"
            variant="ghost"
          >
            <IconDownload />
            <span className="sr-only">Download</span>
          </Button>
          <Button
            className="text-xs focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0"
            onClick={() => copyToClipboard(value)}
            size="icon"
            variant="ghost"
          >
            {isCopied ? <IconCheck /> : <IconCopy />}
            <span className="sr-only">Copy code</span>
          </Button>
        </div>
      </div>
      {memoizedHighlighter}
    </div>
  )
})
