const LANGUAGE_ALIASES: Record<string, string> = {
  bash: "shell",
  js: "javascript",
  jsx: "javascript",
  sh: "shell",
  sol: "solidity",
  ts: "typescript",
  tsx: "typescript",
  zsh: "shell",
}

const SOLIDITY_CODE_REGEX =
  /(?:pragma\s+solidity\b|SPDX-License-Identifier:|(?:contract|interface|library|abstract\s+contract)\s+[A-Za-z_]\w*|import\s+["']@openzeppelin\/)/mu

export type NormalizeCodeLanguageOptions = {
  inferFromContent?: boolean
}

export const normalizeCodeLanguage = (
  language?: string | null,
  value?: string,
  options: NormalizeCodeLanguageOptions = {}
) => {
  const { inferFromContent = true } = options
  const normalizedLanguage = language?.trim().toLowerCase()

  if (normalizedLanguage) {
    return LANGUAGE_ALIASES[normalizedLanguage] ?? normalizedLanguage
  }

  if (inferFromContent && value && SOLIDITY_CODE_REGEX.test(value)) {
    return "solidity"
  }

  return ""
}
