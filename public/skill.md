# Web3GPT skill

Web3GPT is a smart-contract agent. Through this HTTP API you can hold a conversation with it, and
it can write Solidity contracts, compile them, deploy them to EVM chains, and resolve ENS and
Unstoppable Domains names. No account or API key is needed.

Endpoint: `https://w3gpt.ai/api/skill` (`GET` or `POST`; CORS is open)

## Quick start

1. Start a chat and keep the returned `chatId`. It is the only credential for the
   conversation, so treat it as a secret.

   ```bash
   curl https://w3gpt.ai/api/skill
   ```

   ```json
   { "agentId": "agent_web3gpt", "chatId": "Xk3…", "response": null }
   ```

2. Send messages with that `chatId`. Each call returns the agent's reply to your message.

   ```bash
   curl -X POST "https://w3gpt.ai/api/skill?chatId=Xk3…" \
     -H "Content-Type: application/json" \
     -d '{"message":"Deploy an ERC20 named Demo (DEMO) with 1,000,000 supply to Polygon Amoy"}'
   ```

   ```json
   { "agentId": "agent_web3gpt", "chatId": "Xk3…", "response": "…" }
   ```

3. The agent often asks you to confirm before it deploys. Reply in the same chat (for example
   `"Yes, deploy it"`). The deployment reply includes the contract address and transaction hash.

## Parameters

Pass these as JSON body fields (`POST`) or query parameters.

| Name | Description |
| --- | --- |
| `chatId` | Continue this conversation. 1–64 characters of `A-Z a-z 0-9 _ -`. Omit it to start a new chat. |
| `message` | Your message (alias: `prompt`). Up to 50,000 characters. Omit it to just create or read a chat. |
| `agentId` | Use a different Web3GPT agent for a new chat (e.g. a custom agent from `w3gpt.ai/?a=<agentId>`). Ignored for existing chats. |
| `history` | `true` to include the whole conversation as `history: [{ id, role, text }]` (alias: `full`). |

## Response

| Field | Description |
| --- | --- |
| `chatId` | The conversation id. |
| `agentId` | The agent serving this chat. |
| `response` | The agent's latest reply as text, or `null` if there isn't one yet. |
| `history` | Present when `history=true`. |
| `error` | Present on failure, with a non-2xx status. |

## Deploying contracts

- Say which chain to use. Agent deployments are paid for by Web3GPT, and these chains are
  available:

  | Chain | Chain ID |
  | --- | --- |
  | Polygon (mainnet) | 137 |
  | Polygon Amoy | 80002 |
  | Ethereum Sepolia | 11155111 |
  | Base Sepolia | 84532 |
  | Arbitrum Sepolia | 421614 |
  | OP Sepolia | 11155420 |
  | Mantle Sepolia | 5003 |
  | Metis Sepolia | 59902 |
  | Celo Sepolia | 11142220 |

- You can give the full source, or describe the contract and let the agent write it.
  OpenZeppelin and other npm or GitHub imports work. The Solidity version is chosen from the
  `pragma`.
- A deployment is reported only after the chain confirms the contract-creation transaction. The
  reply includes the chain ID, contract address, transaction hash, explorer links and an IPFS
  link to the sources, ABI and bytecode. Verification on the block explorer follows within a
  few minutes.
- Every deployment is listed publicly at `https://w3gpt.ai/contracts`. Aggregate numbers are at
  `https://w3gpt.ai/api/stats`.

## Limits

The endpoint is public, so usage is metered:

| What | Limit |
| --- | --- |
| Messages to the agent | 20 per IP and 30 per chat, every 10 minutes |
| Calls without `message` (create or read a chat) | 120 per IP every 10 minutes |
| Testnet deployments | 10 per caller per hour |
| Polygon mainnet deployments | 2 per caller per day, within a shared daily budget |

- **Over a request limit:** HTTP `429` with a `Retry-After` header (seconds) and
  `X-RateLimit-Limit` / `X-RateLimit-Remaining`. Wait and retry; don't hammer the endpoint.
- **Over a deployment limit:** the agent replies with an explanation (try later, use a testnet,
  or deploy from your own wallet at w3gpt.ai) instead of deploying.

## Errors

| Status | Meaning |
| --- | --- |
| `400` | Invalid `chatId` |
| `413` | `message` longer than 50,000 characters |
| `429` | Rate limited; see `Retry-After` |
| `500` | The agent failed to answer. If you had asked for a deployment, check `https://w3gpt.ai/contracts` (or ask in the same chat) before retrying, so you don't deploy twice. |

## Reference

- OpenAPI: `https://w3gpt.ai/api-docs`
- Browser app: `https://w3gpt.ai`
- Source: `https://github.com/markeljan/web3gpt`
