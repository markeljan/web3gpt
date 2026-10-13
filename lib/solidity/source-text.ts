// Small lexical helpers for Solidity source. They are deliberately not a parser:
// they only need to tell code apart from comments, so that an `import` or
// `pragma` that appears in a comment or NatSpec block is not acted on.

const NEWLINE = "\n"

/** Index just past the string literal that opens at `start`. */
const endOfString = (source: string, start: number) => {
  const quote = source[start]
  let index = start + 1
  while (index < source.length && source[index] !== quote && source[index] !== NEWLINE) {
    index += source[index] === "\\" ? 2 : 1
  }
  return Math.min(index + 1, source.length)
}

/** Index just past the comment that opens at `start`, or `start` if none does. */
const endOfComment = (source: string, start: number) => {
  if (source[start] !== "/") {
    return start
  }
  if (source[start + 1] === "/") {
    const end = source.indexOf(NEWLINE, start)
    return end === -1 ? source.length : end
  }
  if (source[start + 1] === "*") {
    const end = source.indexOf("*/", start + 2)
    return end === -1 ? source.length : end + 2
  }
  return start
}

const blank = (text: string) => text.replace(/[^\n]/g, " ")

/**
 * Returns `source` with every comment replaced by spaces (newlines are kept).
 * The result has the same length as the input, so match offsets found in it
 * can be used to slice the original text. String literals are left intact,
 * including any `//` or `/*` they contain.
 */
export const maskComments = (source: string): string => {
  const parts: string[] = []
  let copiedUpTo = 0
  let index = 0

  while (index < source.length) {
    const char = source[index]
    if (char === '"' || char === "'") {
      index = endOfString(source, index)
      continue
    }
    const commentEnd = endOfComment(source, index)
    if (commentEnd > index) {
      parts.push(source.slice(copiedUpTo, index), blank(source.slice(index, commentEnd)))
      copiedUpTo = commentEnd
      index = commentEnd
    } else {
      index += 1
    }
  }

  parts.push(source.slice(copiedUpTo))
  return parts.join("")
}
