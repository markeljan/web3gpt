# AGENTS.md

## Overview

Web3GPT is a single-app Next.js 16 project for AI-assisted smart contract development. The app combines:

- App Router pages and API routes
- AI SDK chat flows backed by OpenAI models
- GitHub authentication via Better Auth
- Wallet connectivity through Wagmi and RainbowKit
- Contract compilation/deployment helpers built on `solc` and `viem`
- Persistence in Vercel KV for users, chats, agents, deployments, and verification jobs

Primary product flows:

- Chat with built-in or user-created agents
- Deploy Solidity contracts to supported EVM testnets
- Persist chats for signed-in users and share published chats
- Run a Vercel cron to process contract verifications

## Stack

- Runtime/package manager: Bun (`bun.lock` is committed)
- Framework: Next.js 16 App Router
- Language: TypeScript with strict mode
- UI: React 19, Tailwind CSS, Radix UI, shadcn/ui-style primitives
- AI: Vercel AI SDK (`ai`, `@ai-sdk/react`, `@ai-sdk/openai`)
- Auth: `better-auth` with GitHub provider, stateless (cookie) sessions
- Web3: `wagmi`, `viem`, `@rainbow-me/rainbowkit`
- Storage/services: `@vercel/kv`, Vercel Analytics, Pinata
- Lint/format: Ultracite/Biome

## Common Commands

- Install: `bun install`
- Dev server: `bun dev`
- Build: `bun run build`
- Start production server: `bun run start`
- Typecheck: `bun run typecheck`
- Test: `bun test`
- Lint: `bun run lint`
- Format: `bun run format`

Git hooks are managed by `lefthook.yml`. Pre-commit runs `bunx ultracite fix` on JS/TS/JSON/CSS files.

CI (`.github/workflows/ci.yml`) runs `bun install --frozen-lockfile`, `bun run typecheck`, `bun test`, and `bun run lint` on every pull request and on pushes to `main`. Lint warnings do not fail CI; errors do. CI does not run `next build` because it needs real environment variables.

## Environment

Copy from `.env.example`. Important groups:

- RPC and explorer access: `NEXT_PUBLIC_ALCHEMY_API_KEY`, `NEXT_PUBLIC_TENDERLY_API_KEY`, `BLOCKSCOUT_API_KEY`, `ETHERSCAN_API_KEY` (legacy fallbacks: `NEXT_PUBLIC_BLOCKSCOUT_API_KEY`, `NEXT_PUBLIC_ETHERSCAN_API_KEY`)
- RPC overrides (optional): `NEXT_PUBLIC_POLYGON_AMOY_RPC_URL` (wallet client), `POLYGON_AMOY_RPC_URL` and `POLYGON_MAINNET_RPC_URL` (server deployments)
- Domain resolution: `INFURA_API_KEY` (server-only; `NEXT_PUBLIC_INFURA_API_KEY` is read as a legacy fallback)
- Wallet connectivity: `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`
- Auth: `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, `AUTH_SECRET` (Better Auth also accepts `BETTER_AUTH_GITHUB_ID`, `BETTER_AUTH_GITHUB_SECRET`, `BETTER_AUTH_SECRET`)
- AI provider: `OPENAI_API_KEY` (read implicitly by `@ai-sdk/openai`)
- Persistence: `KV_REST_API_URL`, `KV_REST_API_TOKEN` (read implicitly by `@vercel/kv`); `KV_REST_API_READ_ONLY_TOKEN` and `KV_URL` are provisioned by the Vercel KV integration but not read by the app
- Deployment/signing: `DEPLOYER_PRIVATE_KEY`
- Cron auth: `CRON_SECRET`
- IPFS uploads: `PINATA_JWT` and `NEXT_PUBLIC_IPFS_GATEWAY`

Notes:

- `lib/solidity/deploy.ts` assumes `DEPLOYER_PRIVATE_KEY` is present at module load.
- Explorer verification prefers server-side `BLOCKSCOUT_API_KEY` and `ETHERSCAN_API_KEY`, with `NEXT_PUBLIC_*` explorer keys only as fallback for older environments.
- `vercel.json` schedules `/api/cron` every minute and expects `Authorization: Bearer <CRON_SECRET>`.

## Project Map

- `app/`
  - `app/page.tsx`: landing chat entry, chooses agent from `?a=...`
  - `app/chat/[id]/page.tsx`: authenticated saved-chat route (legacy `thread_*` ids are ordinary KV chats)
  - `app/share/[id]/page.tsx`: public published-chat view
  - `app/contracts/page.tsx`: deployments dashboard
  - `app/api/chat/route.ts`: main streaming chat endpoint with tool calling
  - `app/api/skill/route.ts`: public skill endpoint for starting/continuing agent chats by `chatId`
  - `app/api/cron/route.ts`: verification processor for Vercel Cron
- `components/`
  - `components/chat/*`: chat shell, list, composer, actions
  - `components/header/*` and `components/sidebar/*`: persistent app chrome
  - `components/providers/web3-provider.tsx`: Wagmi, RainbowKit, React Query setup
  - `components/ui/*`: shared UI primitives; most are shadcn-style wrappers
- `lib/`
  - `lib/constants.ts`: built-in agents, supported chains, RPC URLs
  - `lib/config.ts`: Wagmi config and chain/explorer helpers
  - `lib/tools.ts`: AI tool definitions exposed to agents
  - `lib/data/kv.ts`: KV persistence and auth-scoped data access
  - `lib/data/agents.ts`: agent lookup
  - `lib/solidity/*`: compile, deploy, verification helpers
  - `lib/actions/*`: server-side actions for chat, deploy, domain resolution, verification
- `public/openapi.json`: API schema for docs/reference
- `lib/auth.ts`: Better Auth server instance and `getSession()`
  - `lib/auth-client.ts`: Better Auth browser client (`signIn`, `signOut`, `useSession`)

## Architecture Notes

- Auth is Better Auth in stateless mode: there is no auth database, sessions are encrypted into a cookie, and user records are written to KV by `storeUser`.
- `session.user.id` is pinned to the GitHub numeric profile id (the value next-auth used). `mapProfileToUser` copies it onto the `githubId` additional field and the `user.create.before` database hook forces it as the record id. Every KV key is scoped by this id, so do not let Better Auth generate its own user ids.
- The `oAuthProxy` plugin routes OAuth callbacks through the origin the GitHub OAuth app registered, replacing next-auth's `AUTH_REDIRECT_PROXY_URL`. `OAUTH_CALLBACK_ORIGIN` in `lib/auth.ts` resolves it with no env var to manage:
  - On Vercel it is `PRODUCTION_URL` (`lib/config.ts`), derived from `VERCEL_PROJECT_PRODUCTION_URL`, which Vercel injects into every deployment including previews. Correct for forks too, since each fork gets its own value.
  - Locally it is `PRODUCTION_URL` when `AUTH_GITHUB_ID` is this project's OAuth app, so core-team local sign-in proxies through production the way it always has.
  - Locally it is the local origin for any other `AUTH_GITHUB_ID`, so a fork running its own OAuth app with a `http://localhost:3000/api/auth/callback/github` callback signs in directly, with the proxy short-circuited.
- Only the client *secret* is sensitive; `PROJECT_GITHUB_CLIENT_ID` in `lib/auth.ts` is public and appears in every authorize URL.
- `app/layout.tsx` is `force-dynamic` because it resolves the session from request headers on every render.
- Built-in agents live in `lib/constants.ts`; user-created agents are stored in KV.
- `app/api/chat/route.ts` builds a system prompt from the selected agent and attaches tools from `lib/tools.ts`.
- `app/api/skill/route.ts` persists anonymous agent chats in KV by `chatId` and returns simplified responses/history for SDK and skill consumers.
- Chat history is persisted only when a user is signed in and a `chatId` is present.
- Abuse limits live in `lib/rate-limit.ts` (fixed-window counters on KV) and `lib/deploy-limits.ts`. `/api/chat`, `/api/skill` and `/api/wallet-deploy/*` are rate limited per IP or user. The `deployContract` tool is metered per caller (`user:<id>` or `ip:<addr>`) because the server wallet pays the gas. Mainnet (any chain viem doesn't flag as a testnet) also has a shared daily budget and fails closed if KV is unreachable. New public routes and new server-wallet tools must be metered the same way.
- `lib/actions/*` modules that are only called from server code must not be marked `"use server"`: that can expose every export as a public action endpoint. Server actions that are exposed must read ownership from KV, never from their arguments.
- Remote Solidity imports are fetched only from `unpkg.com`, `cdn.jsdelivr.net` and `raw.githubusercontent.com` (GitHub blob URLs are rewritten), over https, with a timeout and caps on size and count (`lib/solidity/utils.ts`).
- Compiler selection (`lib/solidity/compiler-version.ts`, `lib/solidity/solc-loader.ts`): the `pragma solidity` lines of the contract and all its imports pick the compiler. The bundled `solc` (0.8.29, `DEFAULT_COMPILER_VERSION`) is used whenever it satisfies them; otherwise the newest satisfying release from `binaries.soliditylang.org/bin/list.json` (cached for an hour) is downloaded, checked against the published sha256, and cached per version for the life of the instance. Releases older than 0.4.11 are refused. Compilers that support it target `evmVersion: "cancun"`, the bundled default. The full version string (`v0.8.24+commit.e11b9ed9`) is stored on the verification record as `compilerVersion`; records without it are verified with `DEFAULT_COMPILER_VERSION`.
- Imports are parsed in all four Solidity forms (`import "x";`, `import "x" as Y;`, `import * as Y from "x";`, `import {A, B} from "x";`, multi-line too), ignoring comments; rewriting to flat file names only replaces the path literal. Bare npm package paths (`solmate/src/...`, `forge-std/...`) are fetched from unpkg like `@`-scoped ones.
- `/api/wallet-deploy/finalize` re-reads the transaction and receipt from the chain and records only what the chain says, after checking that the creation input starts with the bytecode the server compiled.
- Contract deployment flow compiles Solidity, deploys with a server-side private key, uploads artifacts to IPFS, stores verification metadata, and later verifies via cron.
- `lib/data/ipfs.ts` uses the Pinata SDK v2 (`pinata.upload.public.*` builder chain, returns `cid`). Uploads go to the **public** network and the `W3GPT` group; the private network would need signed URLs and must not be used for contract artifacts.
- `NEXT_PUBLIC_IPFS_GATEWAY` includes the protocol because `getIpfsUrl` builds public links from it; the SDK wants a bare domain, so the protocol is stripped when constructing the client.
- The dedicated gateway (`ipfs.w3gpt.ai`) must stay free of Gateway Access Controls. Adding a gateway key makes every generated `ipfsUrl` fail with 401 `ERR_ID:00024`, and the key cannot be added to the URLs because those links are shown to end users. Default `restrict: true` (serve only account-pinned CIDs) is correct and fine.
- Wallet-visible chains live separately from agent deploy chains; Polygon mainnet is agent-only and should not be added to Wagmi connectors.
- The OpenAI Assistants API is no longer used, and the `openai` package is no longer a dependency. Old `thread_*` chats and `asst_*` agents (full message history, agent instructions, and tool names) were migrated into KV, so they are read/write like any other chat. Legacy `thread_*`/`asst_*` ids are just KV ids now; never reintroduce `openai.beta`.

## Working Conventions

- Prefer Bun for local commands.
- Keep imports using the `@/` alias.
- Follow existing semicolon-free formatting and Biome/Ultracite rules.
- Avoid changing `components/ui/*` unless the shared primitive itself needs to change.
- Keep client/server boundaries explicit. Files under `lib/data/*` and `lib/solidity/*` are server-oriented; interactive chat and wallet code live in client components/hooks.
- When editing deployment logic, trace both the user-facing chat tool path and the public API route path.
- Unit tests use `bun:test` and live in `test/*.test.ts` plus colocated `*.test.ts` files (e.g. `lib/solidity/deployment-tool-result.test.ts`); run them with `bun test`. Add or update tests for logic changes, and back them with targeted manual verification for flows that need real services (KV, OpenAI, RPC).

## Safe Edit Checklist

- For chat behavior, inspect both `components/chat/*` and `app/api/chat/route.ts`.
- For auth-sensitive changes, review `lib/auth.ts`, `lib/auth-client.ts`, and any `getSession()` call sites.
- For chain/deployment changes, review `lib/constants.ts`, `lib/config.ts`, `lib/solidity/deploy.ts`, and verification helpers together.
- For data model changes in chats/agents/deployments, audit `lib/types.ts` and `lib/data/kv.ts` before editing route or UI code.
- For public API changes, update both `public/openapi.json` and `public/skill.md`.

## Validation

Minimum validation after non-trivial code changes:

- `bun run typecheck`
- `bun test`
- `bun run lint`

CI runs the same three checks on every pull request.

For UI or route changes, also run the app with `bun dev` and verify the affected flow in the browser.
