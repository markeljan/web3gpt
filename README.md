# Web3GPT

[![CI](https://github.com/markeljan/web3gpt/actions/workflows/ci.yml/badge.svg)](https://github.com/markeljan/web3gpt/actions/workflows/ci.yml)

**AI agents that write, compile, deploy and verify smart contracts.**

Describe a contract in plain language and a Web3GPT agent writes the Solidity, compiles it with
the right `solc` version, deploys it to an EVM chain, pins the sources to IPFS and queues
verification on the block explorer. You can use it in the browser, or call it from your own
agent through a public HTTP skill API.

- **App:** [w3gpt.ai](https://w3gpt.ai)
- **Skill guide (for AI agents):** [w3gpt.ai/skill.md](https://w3gpt.ai/skill.md)
- **API reference:** [w3gpt.ai/api-docs](https://w3gpt.ai/api-docs)
- **Live deployments:** [w3gpt.ai/contracts](https://w3gpt.ai/contracts) · [w3gpt.ai/api/stats](https://w3gpt.ai/api/stats)

## What it does

- **Chat to deploy.** Ask for an ERC-20, an NFT collection, a vesting contract or anything else.
  The agent writes it, using OpenZeppelin and other npm or GitHub imports when useful, and
  deploys it. Every deployment returns the contract address, transaction hash and explorer
  links, and is only reported after a successful contract-creation receipt.
- **Two ways to pay gas.** Agent deployments are signed by Web3GPT's own wallet, so no wallet is
  needed. "Deploy with wallet" compiles on the server and lets you sign the transaction with
  your own wallet via RainbowKit.
- **Any Solidity version.** The compiler is picked from the contract's `pragma` (0.4.11 and
  later). Downloaded compilers are checksum-verified.
- **Verified and reproducible.** Sources, ABI, bytecode and the standard JSON input are pinned to
  IPFS. A background job verifies each contract on Blockscout or Etherscan.
- **Custom agents.** Anyone signed in can create an agent with its own instructions and share
  it by link (`w3gpt.ai/?a=<agentId>`).
- **Agent-to-agent API.** `POST /api/skill` lets other agents and scripts hold a conversation
  with a Web3GPT agent, including deployments, with no account.
- **Saved and shared chats.** Signed-in users (GitHub) keep their chat history, including
  deployment results, and can publish a chat as a public link.

## Supported chains

| Chain | Chain ID | Agent deploys | Wallet deploys |
| --- | --- | --- | --- |
| Polygon | 137 | ✅ (metered, see [Limits](#limits)) | — |
| Polygon Amoy | 80002 | ✅ | ✅ |
| Ethereum Sepolia | 11155111 | ✅ | ✅ |
| Base Sepolia | 84532 | ✅ | ✅ |
| Arbitrum Sepolia | 421614 | ✅ | ✅ |
| OP Sepolia | 11155420 | ✅ | ✅ |
| Mantle Sepolia | 5003 | ✅ | ✅ |
| Metis Sepolia | 59902 | ✅ | ✅ |
| Celo Sepolia | 11142220 | ✅ | ✅ |

Polygon mainnet is intentionally available to agents only, not to wallet connectors. Retired testnets
(e.g. Celo Alfajores) can no longer be deployed to, but their past deployments still appear on the
dashboard.

## Using the skill API

Start a conversation. A new `chatId` is returned, and it is the secret for continuing that
conversation:

```bash
curl https://w3gpt.ai/api/skill
```

Send messages with that `chatId`:

```bash
curl -X POST "https://w3gpt.ai/api/skill?chatId=<chatId>" \
  -H "Content-Type: application/json" \
  -d '{"message":"Deploy an ERC20 called Demo (DEMO) with 1,000,000 supply on Polygon Amoy"}'
```

```json
{ "agentId": "agent_web3gpt", "chatId": "<chatId>", "response": "Deployed Demo at 0x… (tx 0x…) …" }
```

Add `history=true` to get the whole conversation back. The agent may ask you to confirm before
it deploys; reply in the same chat. The full guide, written for AI agents, is
[`skill.md`](https://w3gpt.ai/skill.md). The OpenAPI schema is at
[`/api-docs`](https://w3gpt.ai/api-docs).

### Limits

The public endpoints are metered so the shared deployer wallet and model budget can't be
drained:

- **Agent messages:** 20 per IP and 30 per chat, every 10 minutes. Signed-in browser users get 60
  per 10 minutes.
- **Deployments paid by Web3GPT:** 10 testnet deployments per caller per hour. On Polygon
  mainnet, 2 per caller per day, within a shared daily budget.
- **Over a limit:** you get HTTP `429` with a `Retry-After` header. "Deploy with wallet" has no
  gas limits, because you pay your own gas.

## Self-hosting

### Requirements

- [Bun](https://bun.sh) 1.4+
- An OpenAI API key
- A Redis store with a REST API ([Upstash](https://upstash.com), e.g. through the Vercel
  marketplace integration)
- A funded EVM private key for agent deployments (testnet funds are enough to start)
- A [Pinata](https://pinata.cloud) account for IPFS pinning
- A GitHub OAuth app for sign-in

### Setup

```bash
git clone https://github.com/markeljan/web3gpt.git
cd web3gpt
bun install
cp .env.example .env.local   # then fill it in, see below
bun dev
```

For local sign-in, create a [GitHub OAuth app](https://github.com/settings/developers) with the
callback URL `http://localhost:3000/api/auth/callback/github`. Then set `AUTH_GITHUB_ID`,
`AUTH_GITHUB_SECRET` and `AUTH_SECRET` (any long random string). Nothing else is needed: the
production callback proxy only applies to this project's own OAuth app.

### Environment variables

Required:

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Model provider (agents run on `gpt-6-luna` by default) |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Redis REST endpoint for chats, agents, deployments, rate limits. The legacy Vercel KV names `KV_REST_API_URL` / `KV_REST_API_TOKEN` also work. |
| `DEPLOYER_PRIVATE_KEY` | Hex key (no `0x`) of the wallet that pays for agent deployments |
| `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, `AUTH_SECRET` | GitHub sign-in (Better Auth) |
| `PINATA_JWT` | IPFS uploads |
| `NEXT_PUBLIC_IPFS_GATEWAY` | Public gateway used in links, with protocol (e.g. `https://ipfs.example.com`) |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | RainbowKit / WalletConnect ([Reown dashboard](https://dashboard.reown.com)) |
| `CRON_SECRET` | Authenticates the Vercel cron that runs contract verification |

Recommended:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_ALCHEMY_API_KEY` | Reliable RPC for most chains (public RPCs are the fallback) |
| `ETHERSCAN_API_KEY`, `BLOCKSCOUT_API_KEY` | Contract verification |
| `INFURA_API_KEY` | ENS / Unstoppable Domains resolution tools |
| `NEXT_PUBLIC_TENDERLY_API_KEY` | Tenderly RPC for chains that use it |
| `POLYGON_MAINNET_RPC_URL`, `POLYGON_AMOY_RPC_URL`, `NEXT_PUBLIC_POLYGON_AMOY_RPC_URL` | RPC overrides |
| `AI_MODEL` | Run agents on a different OpenAI model, e.g. `gpt-6.1-sol` for stronger Solidity at higher cost |

Optional limit overrides, with defaults in `lib/rate-limit.ts`:
`MAINNET_DEPLOY_DAILY_LIMIT`, `MAINNET_DEPLOY_DAILY_LIMIT_PER_CALLER`,
`TESTNET_DEPLOY_HOURLY_LIMIT_PER_CALLER`, `RATE_LIMIT_CHAT_ANON`, `RATE_LIMIT_CHAT_USER`,
`RATE_LIMIT_SKILL`, `RATE_LIMIT_SKILL_CHAT`, `RATE_LIMIT_SKILL_READ`, `RATE_LIMIT_COMPILE`,
`RATE_LIMIT_FINALIZE`.

`.env.example` lists every variable.

### Deploying

The app is built for Vercel. `vercel.json` schedules `/api/cron` (contract verification) every
minute and allows API routes up to 300s, which a deployment turn can need. Set the environment
variables above in the Vercel project.

## Development

```bash
bun dev              # dev server on :3000
bun run typecheck    # TypeScript
bun run test         # unit tests (bun test --isolate)
bun run lint         # Ultracite/Biome; zero warnings
bun run format       # auto-fix formatting and lint
bun run build        # production build
```

CI runs typecheck, tests and lint on every pull request.

### How it fits together

```
browser (Next.js app) ──► /api/chat  ─┐
other agents ───────────► /api/skill ─┼─► agent (AI SDK + OpenAI) ─► tools: deployContract, resolveDomain, …
                                      │                                  │
                                      │        compile (solc by pragma) ─┤
                                      │        deploy (viem, server key) ┤
                                      │        pin sources (Pinata/IPFS) ┤
                                      └─► Redis: chats, agents, deployments, rate limits
Vercel cron ─► /api/cron ─► verify queued contracts on Blockscout / Etherscan
```

- `app/`: pages (`/`, `/chat/[id]`, `/share/[id]`, `/contracts`) and API routes
- `components/`: chat UI, sidebar, wallet and deploy components, `ui/` primitives
- `lib/`: agents and chains (`constants.ts`), AI tools (`tools.ts`), persistence
  (`data/`), Solidity compile, deploy and verify (`solidity/`), rate limits
- `test/`: unit tests

[`AGENTS.md`](AGENTS.md) is the detailed guide to the codebase: architecture decisions, invariants
and conventions. Read it before making changes, whether you're a person or a coding agent.

## Security

Please report vulnerabilities privately through
[GitHub security advisories](https://github.com/markeljan/web3gpt/security/advisories/new), not
public issues.

## License

[MIT](LICENSE)
