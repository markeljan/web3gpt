"use client"

import { create } from "zustand"
import { getUpdatesSubscriptionAction } from "@/lib/actions/updates"

// One source of truth for the product-updates sign-up, shared by the landing
// card and the user menu so subscribing in one place updates the other.
//
// localStorage remembers the state for anonymous visitors and avoids a flash of
// the sign-up card on reload. `email_subscribed` is the key the previous form
// used, so people who already signed up aren't asked again.

const SUBSCRIBED_KEY = "email_subscribed"
const DISMISSED_KEY = "early_access_dismissed"

type UpdatesState = {
  /** localStorage has been read. Nothing renders before this, to avoid a flash. */
  hydrated: boolean
  subscribed: boolean
  dismissed: boolean
  /** The address on the list, when known. */
  email: string | null
  /** The signed-in user's own address, for prefilling the form. */
  suggestedEmail: string | null
  /** The server's answer for the signed-in user has arrived. */
  synced: boolean
  hydrate: () => void
  syncWithServer: () => Promise<void>
  setSubscribed: (subscribed: boolean, email?: string | null) => void
  dismiss: () => void
  /** Forget the account-specific state, e.g. after sign-out. */
  resetAccount: () => void
}

const readFlag = (key: string) => {
  try {
    return window.localStorage.getItem(key) === "true"
  } catch {
    return false
  }
}

const writeFlag = (key: string, value: boolean) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Private mode or storage disabled: the in-memory state still works.
  }
}

let syncPromise: Promise<void> | null = null

export const useUpdatesSubscription = create<UpdatesState>((set, get) => ({
  dismiss: () => {
    writeFlag(DISMISSED_KEY, true)
    set({ dismissed: true })
  },
  dismissed: false,
  email: null,
  hydrate: () => {
    if (get().hydrated) {
      return
    }
    set({ dismissed: readFlag(DISMISSED_KEY), hydrated: true, subscribed: readFlag(SUBSCRIBED_KEY) })
  },
  hydrated: false,
  resetAccount: () => {
    syncPromise = null
    set({ suggestedEmail: null, synced: false })
  },
  setSubscribed: (subscribed, email = null) => {
    writeFlag(SUBSCRIBED_KEY, subscribed)
    set({ email: subscribed ? email : null, subscribed })
  },
  subscribed: false,
  suggestedEmail: null,
  synced: false,
  syncWithServer: () => {
    // Landing and the menu can both ask at mount; one request is enough.
    syncPromise ??= getUpdatesSubscriptionAction()
      .then((result) => {
        if (!result) {
          return
        }
        get().hydrate()
        // The account record wins when it says subscribed. When it says not
        // subscribed, a local "yes" from signing up while anonymous still stands.
        if (result.subscribed) {
          writeFlag(SUBSCRIBED_KEY, true)
        }
        set((state) => ({
          email: result.email ?? state.email,
          subscribed: result.subscribed || state.subscribed,
          suggestedEmail: result.suggestedEmail,
          synced: true,
        }))
      })
      .catch(() => {
        syncPromise = null
      })
    return syncPromise
  },
}))
