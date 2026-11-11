import "server-only"
import { betterAuth } from "better-auth"
import { APIError } from "better-auth/api"
import { nextCookies } from "better-auth/next-js"
import { oAuthProxy } from "better-auth/plugins"
import { headers } from "next/headers"
import { VERCEL_ENV } from "vercel-url"
import { APP_URL, PRODUCTION_URL } from "@/lib/config"
import { storeUser } from "@/lib/data/kv"

const THIRTY_DAYS_IN_SECONDS = 60 * 60 * 24 * 30
const ONE_DAY_IN_SECONDS = 60 * 60 * 24

const GITHUB_CLIENT_ID = process.env.BETTER_AUTH_GITHUB_ID || process.env.AUTH_GITHUB_ID || ""

// This project's own GitHub OAuth app. Client ids are public — they appear in
// every authorize URL — and only the client secret is sensitive.
const PROJECT_GITHUB_CLIENT_ID = "Ov23liJPi5FEcJy6kRmj"

// Which origin the GitHub OAuth app has registered as its callback, and so the
// origin the callback has to be proxied through when the app is served anywhere
// else. On Vercel that is always this project's production domain, for forks
// too. Running locally against a fork's own OAuth app, the callback is already
// registered on localhost, so it points at the local origin and the proxy
// short-circuits.
// GitHub avatar URLs embed the same numeric profile id the account is keyed by.
const GITHUB_AVATAR_ID = /avatars\.githubusercontent\.com\/u\/(?<part1>\d+)/u

// Every KV key in this app is scoped by the GitHub numeric id that next-auth
// used as `session.user.id`, so a user record must never be created without one.
// `mapProfileToUser` supplies it as `githubId`, but that value has been observed
// missing by the time the create hook runs, and the fallback of letting Better
// Auth mint a random id silently detaches the account from every chat, agent and
// deployment it owns. The avatar URL carries the same id, so recover it there.
function resolveGithubId(user: Record<string, unknown>): string | null {
  if (typeof user.githubId === "string" && user.githubId.length > 0) {
    return user.githubId
  }
  if (typeof user.image === "string") {
    const matchedId = user.image.match(GITHUB_AVATAR_ID)?.[1]
    if (matchedId) {
      return matchedId
    }
  }
  return null
}

const isLocalDev = !VERCEL_ENV
const usesProjectOAuthApp = GITHUB_CLIENT_ID === PROJECT_GITHUB_CLIENT_ID
const OAUTH_CALLBACK_ORIGIN = isLocalDev && !usesProjectOAuthApp ? APP_URL : PRODUCTION_URL

export const auth = betterAuth({
  appName: "Web3GPT",
  baseURL: APP_URL,
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await storeUser({
            email: user.email,
            id: user.id,
            image: user.image ?? null,
            name: user.name,
          })
        },
        // Pinning the id here keeps existing chats, agents and deployments
        // attached to their owners. See `resolveGithubId`.
        before: (user) => {
          const githubId = resolveGithubId(user)
          if (!githubId) {
            // Fail the sign-in rather than write a record whose data can never
            // be found again.
            throw new APIError("INTERNAL_SERVER_ERROR", {
              message: "Could not resolve a GitHub id for this account.",
            })
          }
          return Promise.resolve({ data: { ...user, githubId, id: githubId } })
        },
      },
    },
  },
  // Bounces the OAuth callback through the origin the OAuth app registered,
  // replacing next-auth's AUTH_REDIRECT_PROXY_URL. Inert whenever the app is
  // already served from that origin.
  plugins: [oAuthProxy({ productionURL: OAUTH_CALLBACK_ORIGIN }), nextCookies()],
  secret: process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET,
  // No database: sessions are signed/encrypted into the cookie, matching the
  // JWT strategy this app used under next-auth. User records live in KV.
  session: {
    expiresIn: THIRTY_DAYS_IN_SECONDS,
    updateAge: ONE_DAY_IN_SECONDS,
  },
  socialProviders: {
    github: {
      clientId: GITHUB_CLIENT_ID,
      clientSecret: process.env.BETTER_AUTH_GITHUB_SECRET || process.env.AUTH_GITHUB_SECRET || "",
      mapProfileToUser: (profile) => ({
        // GitHub omits the email when the user keeps it private and the
        // /user/emails lookup finds nothing public.
        email: profile.email || `${profile.id}+${profile.login}@users.noreply.github.com`,
        githubId: String(profile.id),
      }),
    },
  },
  user: {
    additionalFields: {
      githubId: {
        input: true,
        required: false,
        type: "string",
      },
    },
  },
})

export async function getSession() {
  return await auth.api.getSession({ headers: await headers() })
}
