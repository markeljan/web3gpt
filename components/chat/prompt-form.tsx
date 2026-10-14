"use client"

import { ArrowUp, Square, X } from "lucide-react"
import { type ChangeEvent, useCallback, useEffect, useRef, useState } from "react"
import Textarea from "react-textarea-autosize"
import { IconPlus } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useEnterSubmit } from "@/lib/hooks/use-enter-submit"
import { useLocalStorage } from "@/lib/hooks/use-local-storage"
import { cn } from "@/lib/utils"

const GUILD_PROMPT_STORAGE_KEY = "w3gpt-guild-prompt-seen"
// Only nudge once the reader is actually composing something, never on focus.
const GUILD_PROMPT_MIN_CHARS = 12

type PromptFormProps = {
  onSubmit: (text: string) => void
  stop: () => void
  onNewChat: () => void
  isLoading: boolean
  isEmpty: boolean
}

export const PromptForm = ({ onSubmit, stop, onNewChat, isLoading, isEmpty }: PromptFormProps) => {
  const [input, setInput] = useState("")
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const { formRef, onKeyDown } = useEnterSubmit()
  const [hasSeenGuildPrompt, setHasSeenGuildPrompt] = useLocalStorage(GUILD_PROMPT_STORAGE_KEY, false)
  const [isGuildBannerOpen, setIsGuildBannerOpen] = useState(false)

  const canSend = input.trim().length > 0 && !isLoading

  // Autofocus on pointer devices only; on touch this would open the keyboard
  // over the conversation before the reader has decided to type.
  useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches) {
      inputRef.current?.focus()
    }
  }, [])

  const dismissGuildBanner = useCallback(() => {
    setIsGuildBannerOpen(false)
    setHasSeenGuildPrompt(true)
  }, [setHasSeenGuildPrompt])

  const handleInputChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const { value } = event.target
    setInput(value)

    // biome-ignore lint/suspicious/noUnnecessaryConditions: Biome narrows useLocalStorage's T to the literal false, but the stored value is true once the banner was dismissed
    if (!hasSeenGuildPrompt && value.trim().length >= GUILD_PROMPT_MIN_CHARS) {
      setIsGuildBannerOpen(true)
    }
  }

  // Return focus to the composer when a response finishes, but only if focus is
  // still somewhere neutral — never yank it out of a link or button the reader
  // is using, and never auto-focus on mount (that pops the mobile keyboard).
  const wasLoading = useRef(false)
  useEffect(() => {
    // biome-ignore lint/suspicious/noUnnecessaryConditions: Biome types useRef(false).current as always false, but it is updated to isLoading on every run
    const finishedLoading = wasLoading.current && !isLoading
    wasLoading.current = isLoading

    // biome-ignore lint/suspicious/noUnnecessaryConditions: follows from the false positive on wasLoading.current above
    if (!finishedLoading) {
      return
    }

    const active = document.activeElement
    if (active === null || active === document.body) {
      inputRef.current?.focus()
    }
  }, [isLoading])

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (isLoading) {
      return
    }

    const value = input.trim()
    if (!value) {
      return
    }

    setInput("")
    onSubmit(value)
  }

  return (
    <div className="flex flex-col gap-2">
      {isGuildBannerOpen ? (
        <div className="flex items-center gap-3 rounded-xl border bg-background/95 px-3 py-2 text-sm shadow-xs">
          <span className="min-w-0 flex-1 text-muted-foreground">
            Join the w3gpt Guild for special roles and upcoming rewards.
          </span>
          <Button asChild className="h-7 shrink-0 px-2" size="sm" variant="secondary">
            <a href="https://guild.xyz/w3gpt" onClick={dismissGuildBanner} rel="noreferrer" target="_blank">
              Join
            </a>
          </Button>
          <Button
            aria-label="Dismiss guild invitation"
            className="size-7 shrink-0 text-muted-foreground"
            onClick={dismissGuildBanner}
            size="icon"
            variant="ghost"
          >
            <X aria-hidden="true" className="size-3.5" />
          </Button>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} ref={formRef}>
        <div
          className={cn(
            "flex items-end gap-2 rounded-2xl border bg-background p-2 shadow-lg transition-colors",
            "focus-within:border-ring/60 focus-within:ring-1 focus-within:ring-ring/30"
          )}
        >
          <Tooltip delayDuration={500}>
            <TooltipTrigger asChild>
              <Button
                aria-label="Start a new chat"
                className="size-9 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
                disabled={isEmpty || isLoading}
                onClick={onNewChat}
                size="icon"
                type="button"
                variant="ghost"
              >
                <IconPlus className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>New chat</TooltipContent>
          </Tooltip>

          <Textarea
            aria-label="Message Web3GPT"
            autoComplete="off"
            autoCorrect="off"
            className="max-h-[240px] min-h-[36px] w-full flex-1 resize-none self-center bg-transparent py-2 text-base outline-hidden sm:text-sm"
            maxRows={10}
            onChange={handleInputChange}
            onKeyDown={onKeyDown}
            placeholder="Ask Web3GPT to build or deploy a contract…"
            ref={inputRef}
            rows={1}
            spellCheck={false}
            value={input}
          />

          {isLoading ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label="Stop generating"
                  className="size-9 shrink-0 rounded-full"
                  onClick={stop}
                  size="icon"
                  type="button"
                  variant="secondary"
                >
                  <Square aria-hidden="true" className="size-3.5 fill-current" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Stop generating</TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label="Send message"
                  className="size-9 shrink-0 rounded-full"
                  disabled={!canSend}
                  size="icon"
                  type="submit"
                >
                  <ArrowUp aria-hidden="true" className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Send · Enter</TooltipContent>
            </Tooltip>
          )}
        </div>
      </form>
    </div>
  )
}
