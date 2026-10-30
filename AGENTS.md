# AGENTS.md

The working guide to this codebase for people and coding agents. It covers architecture,
invariants that must not be broken, and conventions. The [README](README.md) covers what the
product is and how to run it.

## What this is

Web3GPT is a single Next.js 16 (App Router) app. AI agents write, compile, deploy and verify
Solidity contracts. People use it in the browser at w3gpt.ai, and other agents use it through
the public skill API (`/api/skill`).

| Concern | Choice |
| --- | --- |
| Runtime / package manager | Bun (`bun.lock` is committed) |
| Framework | Next.js 16 App Router, React 19, TypeScript (strict) |
| UI | Tailwind CSS 4 (configured in `app/globals.css`), Radix UI, shadcn-style primitives in `components/ui/` |
| AI | Vercel AI SDK 7 (`ai`, `@ai-sdk/react`, `@ai-sdk/openai`), OpenAI Responses API, model from `lib/ai-model.ts` |
| Auth | Better Auth, GitHub provider, stateless cookie sessions |
| Web3 | viem, wagmi 2 + RainbowKit (wallet deploys), `solc` (compiles) |
| Storage | Upstash Redis over REST (`@upstash/redis`; shared client in `lib/redis.ts`) |
| Files | Pinata (public IPFS) |
| Lint / format | Ultracite (Biome) |

## Commands

```bash
bun install
bun dev              # :3000
bun run typecheck
bun run test         # = bun test --isolate (see Testing)
bun run lint         # must report 0 errors and 0 warnings
bun run format       # ultracite fix
bun run build        # needs env vars; see .env.example
```

CI (`.github/workflows/ci.yml`) runs `bun install --frozen-lockfile`, typecheck, test and lint
on every PR and on pushes to `main`. It does not run `next build`, because the build needs real
environment variables. `lib/solidity/deploy.ts` reads `DEPLOYER_PRIVATE_KEY` at module load.
Lefthook runs `bunx ultracite fix` on the staged JS/TS/JSON/CSS files before each commit.

## Map

- `app/`
  - `page.tsx`: chat entry point; `?a=<agentId>` selects the agent
  - `chat/[id]`: a signed-in user's saved chat (owner only)
  - `share/[id]`: a published chat (public, read-only)
  - `contracts/`: public dashboard of recorded deployments
  - `api/chat`: streaming chat for the browser (AI SDK UI message stream)
  - `api/skill`: public JSON chat API for other agents (`GET`/`POST`, `chatId` is the secret)
  - `api/wallet-deploy/{prepare,finalize}`: compile for, then record, a user-signed deployment
  - `api/cron`: Vercel cron that drives the verification queue
  - `api/stats`, `api/og`, `api/api-docs`, `api/farcaster`, `api/auth/[...all]`
- `components/`
  - `chat/`: chat shell, message rendering (text, reasoning, tool parts), composer
  - `header/`, `sidebar/`: app chrome
  - `providers/web3-provider.tsx`: wagmi, RainbowKit, React Query
  - `ui/`: shared primitives; change only when the primitive itself must change
- `lib/`
  - `constants.ts`: built-in agents, chains, RPC URLs, compiler default
  - `config.ts`: chain lookup, explorer details, app URLs
  - `agent-chat.ts`: system prompt, history window, `streamAgentReply` / `generateAgentReply`
  - `ai-model.ts`: the OpenAI model and reasoning effort (`gpt-6.1-terra` at medium, model
    overridable with `AI_MODEL`)
  - `tools.ts`: tools the model can call (`deployContract`, `resolveDomain`, `resolveAddress`,
    `createAgent`)
  - `redis.ts`: the one Redis client (reads `UPSTASH_REDIS_REST_*`, falls back to `KV_REST_API_*`)
  - `data/kv.ts`: all persistence, with ownership checks; `data/agents.ts`, `data/ipfs.ts`
  - `solidity/`: import resolution, compiler selection and loading, compile, deploy,
    verification queue
  - `rate-limit.ts`, `deploy-limits.ts`: abuse limits
  - `chat-ownership.ts`: ownership rules for stored chats
  - `auth.ts` (server), `auth-client.ts` (browser)
- `public/skill.md`, `public/openapi.json`: public API docs (keep both in sync with `api/skill`)
- `test/`: unit tests

## Invariants

These rules come from real incidents or security fixes. Breaking them reintroduces the bug.

### Identity and ownership

- `session.user.id` is the user's numeric GitHub id, the value next-auth used, and every Redis
  key is scoped by it. `mapProfileToUser` copies it to `githubId`, and the `user.create.before`
  hook forces it as the record id, recovering it from the avatar URL if needed. Never let Better
  Auth mint its own ids.
- Chat ids come from the client, and published ids are public. Ownership is always read from the
  stored record (`getChatOwnerId`), never from a request: `storeChat` claims new ids with
  `HSETNX` and refuses foreign ones; share, delete and clear check the stored owner;
  `getPublishedChat` returns nothing for unpublished chats.
- Redis deserializes values automatically (the client in `lib/redis.ts` keeps the options
  `@vercel/kv` used), so numeric ids come back as numbers. Compare owners with `isChatOwner` /
  `normalizeOwnerId`. Never construct a second Redis client; import `redis` from `@/lib/redis`.
- Exported functions in a `"use server"` file are public HTTP endpoints. Modules that only
  server code calls (`lib/actions/deploy-contract.ts`, `lib/actions/verification.ts`) are plain
  `server-only` modules. Real server actions (`lib/actions/chat.ts`) treat every argument as
  attacker-controlled.

### Money and abuse

- Agent deployments are signed by `DEPLOYER_PRIVATE_KEY`, so the server pays. The
  `deployContract` tool is metered per caller (`user:<id>` or `ip:<addr>`) in
  `lib/deploy-limits.ts`. Mainnet is any chain viem doesn't flag `testnet`. It has a per-caller
  and a shared daily budget, and fails closed if Redis is unreachable.
- `/api/chat`, `/api/skill` and `/api/wallet-deploy/*` are rate limited (`lib/rate-limit.ts`,
  fixed windows in Redis). Meter any new public route or server-wallet tool the same way.
- The model sees only the last 40 messages (`toModelWindow`), and never a client-supplied
  `system` message: those are dropped, because history comes from the client and AI SDK 7 rejects
  system messages in `messages`. The system prompt is built on the server from the agent.
  `/api/chat` caps the body at 1 MB; `/api/skill` caps messages at 50k characters.

### Deployments

- A server-side deployment is reported and recorded only after a successful contract-creation
  receipt (`getDeployedContractAddress`).
- `/api/wallet-deploy/finalize` records only what the chain reports. It re-reads the transaction
  and receipt, requires the creation input to start with the bytecode the server compiled, and
  derives address, deployer and constructor args from the chain. A Redis lock prevents
  double-recording.
- Polygon mainnet is available to agents only. Wallet-visible chains (`SUPPORTED_CHAINS`) are
  kept separate from agent chains (`AGENT_DEPLOY_CHAINS`).
- Retired chains (e.g. Celo Alfajores, 44787) go in `RETIRED_CHAINS`: `getChainById` no longer
  returns them, so nothing can deploy there, but `getDisplayChainById` still names them for past
  records on `/contracts` and `/api/stats`. Don't link to an explorer that now redirects to
  another chain. Before adding or keeping a chain, check its RPC answers `eth_chainId`.

### Solidity

- Remote imports are fetched only from `unpkg.com`, `cdn.jsdelivr.net` and
  `raw.githubusercontent.com` (GitHub blob URLs are rewritten), over https, with timeouts and
  size and count caps. Re-check redirects against the allowlist.
- All four import forms are parsed, multi-line included, and comments are ignored. Rewriting to
  flat file names replaces only the path literal, so aliases and symbol lists survive. Bare npm
  paths (`solmate/…`, `forge-std/…`) resolve through unpkg.
- The compiler is chosen from every `pragma solidity` in the contract and its imports. The
  bundled `solc` 0.8.37 (`DEFAULT_COMPILER_VERSION`) is used when it satisfies them. Otherwise
  the newest satisfying release is downloaded from binaries.soliditylang.org, checked against its
  published sha256 (refused without one), and cached per version. Versions before 0.4.11 are
  refused.
- Compiles are pinned to `evmVersion: "cancun"`. Newer solc defaults to osaka, which not every
  deploy chain supports.
- The full compiler version is stored on each verification record as `compilerVersion`, and
  verification uses it. Records from before that field existed are verified with
  `LEGACY_COMPILER_VERSION` (0.8.29, what they were built with). That constant must never change
  when the bundled compiler is upgraded.

### Verification queue

- `/api/cron` runs every minute. Selection is pure and tested
  (`lib/solidity/verification-queue.ts`): fresh deployments go first, retries back off
  exponentially, and records are retired after 10 attempts, when malformed, or when an
  explorer says "Fail - Unable to verify". Retired records move to `verification-failed:*` with
  a 7-day TTL, so they never block the queue.
- Scans of `verification:*` and `deployment:*` survive a key that isn't a hash: @upstash/redis
  throws on WRONGTYPE inside a `keepErrors` pipeline, so `readHashes` falls back to key-by-key
  reads and counts or skips the bad key. Network errors still throw.

### Chat persistence

- `/api/chat` stores the exact UI messages the client rendered (`toUIMessageStream` with
  `originalMessages` and `onFinish`), tool results included. The UI stream is teed and the server
  drains its own copy, so a client disconnect can't truncate what is stored. Stored messages
  from AI SDK 6 load unchanged under v7. Some old stored chats still use the v4 `content` shape;
  `toUIMessages` (`lib/chat-utils.ts`) converts them.
- `/api/skill` builds its reply from `result.responseMessages` (all steps), not
  `result.response.messages`, which in v7 covers only the final step.
- Only signed-in users with a `chatId` are persisted in the browser flow. Skill chats are stored
  by `chatId` regardless.

### IPFS

- Artifacts go to Pinata's **public** network (group `W3GPT`). The dedicated gateway
  (`ipfs.w3gpt.ai`) must not have Gateway Access Controls: a gateway key makes every public
  `ipfsUrl` return 401.
- `NEXT_PUBLIC_IPFS_GATEWAY` includes the protocol (links are built from it). The SDK gets the
  bare domain.

### History

- The OpenAI Assistants API is gone. Legacy `thread_*` chats and `asst_*` agents were migrated
  into Redis and are ordinary records. Never reintroduce `openai.beta`.

## Auth details

- The `oAuthProxy` plugin bounces GitHub callbacks through the origin registered on the OAuth
  app. `OAUTH_CALLBACK_ORIGIN` in `lib/auth.ts`:
  - **On Vercel:** `PRODUCTION_URL`, derived from `VERCEL_PROJECT_PRODUCTION_URL`. This holds for
    previews and forks too.
  - **Locally, with this project's OAuth app:** `PRODUCTION_URL`.
  - **Locally, with any other OAuth app:** the local origin, so forks sign in directly against
    `http://localhost:3000/api/auth/callback/github`.
- `PROJECT_GITHUB_CLIENT_ID` is public; only the secret is sensitive.
- `app/layout.tsx` is `force-dynamic` because it reads the session from request headers.

## Testing

- Tests use `bun:test` in `test/*.test.ts` and colocated `*.test.ts` files. Run them with
  `bun run test`, which passes `--isolate`. `mock.module` is process-wide in Bun, so without
  isolation one file's mock leaks into others depending on file discovery order. That happened
  in CI, and it differs between machines.
- Pure logic (selection, limits, ownership, compiler choice, import parsing) gets direct unit
  tests. Route handlers are tested with in-memory fakes: mock `@/lib/redis` (export `{ redis }`)
  and use `MockLanguageModelV4` from `ai/test`, as `test/chat-persistence.test.ts` does.
- Flows that need real services (Redis, OpenAI, RPC, explorers) also need a targeted manual
  check. The fastest end-to-end check is a skill-API conversation that deploys a small contract
  to Polygon Amoy.

## Conventions

- Bun for everything; `@/` imports; semicolon-free formatting; let Ultracite fix style.
- Styling is Tailwind 4: theme tokens, plugins and animations live in `app/globals.css` (there
  is no `tailwind.config.ts`). Colour tokens are full colours, so write `var(--primary)`, never
  `hsl(var(--primary))`.
- Lint is at zero warnings and every rule is an error. Suppress only with a targeted
  `biome-ignore` that states the reason.
- Keep client and server boundaries explicit: `lib/data/*` and `lib/solidity/*` are server-only;
  wallet and chat UI code lives in client components and hooks.
- When changing deployment logic, trace both paths: the agent tool (`lib/tools.ts` →
  `lib/solidity/deploy.ts`) and the wallet flow (`api/wallet-deploy/*` +
  `lib/hooks/use-wallet-deploy.ts`).
- When changing the public API, update `public/skill.md` and `public/openapi.json` together.
- Commits use conventional-commit subjects with a body that explains why. PRs say what was
  tested and what still needs checking in production.

## Checklist by area

- **Chat:** `components/chat/*`, `app/api/chat/route.ts`, `app/api/skill/route.ts`,
  `lib/agent-chat.ts`, `lib/chat-utils.ts`.
- **Auth:** `lib/auth.ts`, `lib/auth-client.ts`, every `getSession()` caller.
- **Chains / deploys:** `lib/constants.ts`, `lib/config.ts`, `lib/solidity/deploy.ts`,
  explorers (`lib/blockscout.ts`, `lib/etherscan.ts`), `lib/deployment-analytics.ts`.
- **Data model:** `lib/types.ts` and `lib/data/kv.ts` before any route or UI.
- **Dependencies:** wagmi stays on 2.x until RainbowKit ships wagmi 3 support (RainbowKit 2.2.x
  peers on `wagmi ^2.9.0`); check its peer range before upgrading wagmi.
