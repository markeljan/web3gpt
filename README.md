# Web3GPT

Web3GPT is an AI-powered smart contract platform for chatting with onchain agents, deploying Solidity contracts, and running agent-driven workflows on EVM chains.

The current public integration surface is agent-first:

- browser chat UI at [w3gpt.ai](https://w3gpt.ai)
- skill endpoint at `https://w3gpt.ai/api/skill`
- public aggregate stats at `https://w3gpt.ai/api/stats`
- skill guide at `https://w3gpt.ai/skill.md`
- API reference at `https://w3gpt.ai/api-docs`

## What Changed

- the old Unkey-backed `/api/v1` endpoints are removed
- the SDK now targets the skill/chat flow instead of separate completions/deploy APIs
- Polygon mainnet deployment is available through the agent and skill endpoint
- server-side deployments are returned and recorded only after a successful contract-creation receipt
- Polygon mainnet is not exposed through wallet connectors in the UI

## Core Flows

- chat with built-in or user-created Web3GPT agents
- deploy contracts through the agent conversation
- persist authenticated browser chats in Vercel KV
- persist anonymous skill chats by `chatId`
- verify deployments through the Vercel cron job

## Supported Agent Deployment Chains

- Polygon Mainnet
- Polygon Amoy
- Base Sepolia
- Arbitrum Sepolia
- Optimism Sepolia
- Mantle Sepolia
- Metis Sepolia
- Celo Alfajores
- Ethereum Sepolia

## Getting Started

1. Clone the repository.
2. Copy `.env.example` and fill in the required variables.
3. Install dependencies.
4. Run the app.

```bash
bun install
bun dev
```

## Local Sign-In

Create a [GitHub OAuth app](https://github.com/settings/developers) with the callback URL
`http://localhost:3000/api/auth/callback/github`, then set `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`
and `AUTH_SECRET` in `.env.local`. Sign-in works locally with no further configuration.

## Important Environment Variables

- `OPENAI_API_KEY`
- `DEPLOYER_PRIVATE_KEY`
- `AUTH_GITHUB_ID`
- `AUTH_GITHUB_SECRET`
- `AUTH_SECRET`
- `CRON_SECRET`
- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`
- `NEXT_PUBLIC_ALCHEMY_API_KEY`
- optional `NEXT_PUBLIC_POLYGON_AMOY_RPC_URL` wallet-client override
- optional `POLYGON_AMOY_RPC_URL` and `POLYGON_MAINNET_RPC_URL` server deployment overrides
- `NEXT_PUBLIC_TENDERLY_API_KEY`
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`
- `ETHERSCAN_API_KEY`
- `BLOCKSCOUT_API_KEY`
- `INFURA_API_KEY` for ENS/Unstoppable Domains resolution (server-only; `NEXT_PUBLIC_INFURA_API_KEY` is still read as a fallback)
- `PINATA_JWT`
- `NEXT_PUBLIC_IPFS_GATEWAY` (including the protocol, e.g. `https://ipfs.example.com`)

## Skill API

Start a chat:

```bash
curl https://w3gpt.ai/api/skill
```

Continue a chat:

```bash
curl -X POST "https://w3gpt.ai/api/skill?chatId=your-chat-id" \
  -H "Content-Type: application/json" \
  -d '{"message":"Deploy an ERC20 on Polygon mainnet"}'
```

Include full history:

```bash
curl "https://w3gpt.ai/api/skill?chatId=your-chat-id&history=true"
```

The `chatId` is the secret for continuing a thread outside the browser UI.

Successful deployment tool results include `chainId`, `contractAddress`, `transactionHash`,
`explorerUrl`, and `transactionExplorerUrl`. Polygon mainnet uses chain ID `137`; Polygon
Amoy uses chain ID `80002`.

## Public Analytics

- all recorded deployments: [w3gpt.ai/contracts](https://w3gpt.ai/contracts)
- Polygon mainnet filter: [w3gpt.ai/contracts?chain=polygon](https://w3gpt.ai/contracts?chain=polygon)
- Polygon Amoy filter: [w3gpt.ai/contracts?chain=amoy](https://w3gpt.ai/contracts?chain=amoy)
- machine-readable aggregate: [w3gpt.ai/api/stats](https://w3gpt.ai/api/stats)

The aggregate reports custom agent records and deduplicated deployment records by chain. It
includes its definitions and observation time so the values can be cited without treating
testnet activity as mainnet activity.

Representative public custom agents include:

- [Dapp Creator](https://w3gpt.ai/?a=asst_K4OLY9h6g8Pwq9Vf9jgxr3ko)
- [CTF Agent](https://w3gpt.ai/?a=asst_GfjkcVcwAXzkNE1JBXNfe89q)
- [TokenScript GPT Agent](https://w3gpt.ai/?a=asst_Ava303baS9hyZeytRhuQG29v)
- [Climate Tribe Map Location Saver](https://w3gpt.ai/?a=asst_jot3PNdg8gF638N1IjRIusl6)

## Development Commands

- `bun dev`
- `bun run build`
- `bun run start`
- `bun run typecheck`
- `bun run test`
- `bun run lint`
- `bun run format`

CI (`.github/workflows/ci.yml`) runs `bun run typecheck`, `bun run test`, and `bun run lint` on pull requests and pushes to `main`.
