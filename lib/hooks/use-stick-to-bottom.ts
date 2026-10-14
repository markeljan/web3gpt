"use client"

import { type RefObject, useCallback, useEffect, useRef, useState } from "react"

// How close to the bottom still counts as "at the bottom".
const BOTTOM_THRESHOLD_PX = 80

export type StickToBottom = {
  /** Attach to the element that owns `overflow-y: auto`. */
  scrollRef: RefObject<HTMLDivElement | null>
  /** Attach to the growing content wrapper inside the scroll element. */
  contentRef: RefObject<HTMLDivElement | null>
  isAtBottom: boolean
  /** Re-pin to the bottom if the reader has not scrolled away. */
  follow: () => void
  /** Pin to the bottom unconditionally (reader intent). */
  scrollToBottom: (behavior?: ScrollBehavior) => void
}

/**
 * Keeps a scroll container pinned to its bottom edge while content grows, and
 * releases the pin as soon as the reader scrolls away from the bottom.
 *
 * The container is observed directly rather than the window: the app shell is
 * `h-screen overflow-hidden`, so `window.scrollY` never moves.
 *
 * Growth is tracked two ways on purpose. `follow()` is called from a render
 * effect on every message update, which is what actually keeps the transcript
 * pinned during streaming. The observers below are the backstop for height
 * changes React does not drive — images and highlighted code blocks settling,
 * the composer growing, viewport resizes — and they only run while the page is
 * being rendered, which a hidden tab is not.
 */
export function useStickToBottom(): StickToBottom {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const isPinned = useRef(true)
  const [isAtBottom, setIsAtBottom] = useState(true)

  const measure = useCallback(() => {
    const element = scrollRef.current
    if (!element) {
      return
    }

    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight
    const atBottom = distanceFromBottom <= BOTTOM_THRESHOLD_PX
    isPinned.current = atBottom
    setIsAtBottom(atBottom)
  }, [])

  // Jump, never animate: smooth scrolling cannot keep up with token streaming.
  const follow = useCallback(() => {
    const element = scrollRef.current
    if (!(element && isPinned.current)) {
      return
    }

    element.scrollTop = element.scrollHeight
  }, [])

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const element = scrollRef.current
    if (!element) {
      return
    }

    isPinned.current = true
    setIsAtBottom(true)
    element.scrollTo({ behavior, top: element.scrollHeight })
  }, [])

  useEffect(() => {
    const element = scrollRef.current
    const content = contentRef.current
    if (!(element && content)) {
      return
    }

    const handleGrowth = () => {
      follow()
      measure()
    }

    // Unpin on the gesture itself, not on the `scroll` event it produces.
    // During streaming, `follow()` runs on every commit (~every 50ms), which can
    // beat the browser's async scroll dispatch and yank the reader back down
    // mid-drag. Releasing synchronously here closes that race; `measure()` will
    // re-pin on the scroll event if they end up back at the bottom anyway.
    const releasePin = () => {
      isPinned.current = false
    }

    const releasePinOnUpwardWheel = (event: WheelEvent) => {
      if (event.deltaY < 0) {
        releasePin()
      }
    }

    const observer = new ResizeObserver(handleGrowth)
    observer.observe(content)
    observer.observe(element)

    element.addEventListener("scroll", measure, { passive: true })
    element.addEventListener("wheel", releasePinOnUpwardWheel, { passive: true })
    element.addEventListener("touchmove", releasePin, { passive: true })

    // Start at the bottom so restored conversations open on the latest message.
    element.scrollTop = element.scrollHeight
    measure()

    return () => {
      observer.disconnect()
      element.removeEventListener("scroll", measure)
      element.removeEventListener("wheel", releasePinOnUpwardWheel)
      element.removeEventListener("touchmove", releasePin)
    }
  }, [follow, measure])

  return { contentRef, follow, isAtBottom, scrollRef, scrollToBottom }
}
