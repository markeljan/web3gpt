import { generateId, type UIMessage } from "ai"
import type { SkillChatHistoryItem } from "@/lib/types"

const MAX_TITLE_LENGTH = 50

type AgentResponseMessage = {
  role: string
  content: string | Array<{ type: string; text?: string; output?: unknown }>
}

type AgentToolResult = {
  output?: unknown
}

const stringifyResponseOutput = (output: unknown): string => {
  if (typeof output === "string") {
    return output.trim()
  }

  if (typeof output === "number" || typeof output === "boolean") {
    return String(output)
  }

  if (Array.isArray(output)) {
    return output.map(stringifyResponseOutput).filter(Boolean).join("\n\n").trim()
  }

  if (!output || typeof output !== "object") {
    return ""
  }

  const record = output as Record<string, unknown>

  if (typeof record.value === "string") {
    return record.value.trim()
  }

  if (typeof record.text === "string") {
    return record.text.trim()
  }

  if (Array.isArray(record.content)) {
    const contentText = stringifyResponseOutput(record.content)
    if (contentText) {
      return contentText
    }
  }

  const stdout = typeof record.stdout === "string" ? record.stdout.trim() : ""
  const stderr = typeof record.stderr === "string" ? record.stderr.trim() : ""

  if (stdout || stderr) {
    return [stdout, stderr].filter(Boolean).join("\n").trim()
  }

  try {
    return JSON.stringify(output, null, 2)
  } catch {
    return ""
  }
}

export const getMessageText = (message: Pick<UIMessage, "parts">): string =>
  message.parts
    .filter((part) => part.type === "text")
    .map((part) => ("text" in part ? part.text : ""))
    .join("")
    .trim()

export const createTextMessage = (role: "user" | "assistant", text: string): UIMessage => ({
  id: generateId(),
  parts: [{ text, type: "text" }],
  role,
})

export const buildChatTitle = (messages: UIMessage[], fallback = "New Chat"): string => {
  const firstUserMessage = messages.find((message) => message.role === "user")
  const text = firstUserMessage ? getMessageText(firstUserMessage) : ""

  return text ? text.slice(0, MAX_TITLE_LENGTH) : fallback
}

export const getAssistantTextFromResponseMessages = (messages: AgentResponseMessage[]): string =>
  messages
    .filter((message) => message.role === "assistant")
    .flatMap((message) =>
      typeof message.content === "string" ? [{ text: message.content, type: "text" }] : message.content
    )
    .filter((part) => part.type === "text")
    .map((part) => part.text || "")
    .join("")
    .trim()

export const getToolTextFromResponseMessages = (messages: AgentResponseMessage[]): string =>
  messages
    .filter((message) => message.role === "tool")
    .flatMap((message) => (typeof message.content === "string" ? [] : message.content))
    .filter((part) => part.type === "tool-result")
    .map((part) => stringifyResponseOutput(part.output))
    .filter(Boolean)
    .join("\n\n")
    .trim()

export const getToolTextFromResults = (toolResults: AgentToolResult[]): string =>
  toolResults
    .map((toolResult) => stringifyResponseOutput(toolResult.output))
    .filter(Boolean)
    .join("\n\n")
    .trim()

export const getResponseText = ({
  text,
  responseMessages,
  toolResults,
}: {
  text?: string | null
  responseMessages?: AgentResponseMessage[]
  toolResults?: AgentToolResult[]
}): string | null => {
  const assistantText = text?.trim() || getAssistantTextFromResponseMessages(responseMessages || [])

  if (assistantText) {
    return assistantText
  }

  const toolText = getToolTextFromResponseMessages(responseMessages || []) || getToolTextFromResults(toolResults || [])

  return toolText || null
}

export const getLatestAssistantText = (messages: UIMessage[]): string | null => {
  const assistantMessages = messages.filter((message) => message.role === "assistant")
  const latestAssistantMessage = assistantMessages.at(-1)

  if (!latestAssistantMessage) {
    return null
  }

  const text = getMessageText(latestAssistantMessage)
  return text || null
}

export const toHistoryItems = (messages: UIMessage[]): SkillChatHistoryItem[] =>
  messages.map((message) => ({
    id: message.id,
    role: message.role,
    text: getMessageText(message),
  }))
