# Web3GPT Skill

Use the Web3GPT skill endpoint to start a chat, continue a chat, and optionally return the full history.

Base endpoint:

`https://w3gpt.ai/api/skill`

## Start a new chat

Call the endpoint with no parameters.

```bash
curl https://w3gpt.ai/api/skill
```

Response:

```json
{
  "agentId": "agent_web3gpt",
  "chatId": "generated-chat-id",
  "response": null
}
```

Save the `chatId`. That is the secret for continuing the same thread.

## Continue a chat

Send a message with the same `chatId`.

```bash
curl -X POST "https://w3gpt.ai/api/skill?chatId=generated-chat-id" \
  -H "Content-Type: application/json" \
  -d '{"message":"Deploy an ERC20 on Polygon mainnet with 1,000,000 supply"}'
```

Response:

```json
{
  "agentId": "agent_web3gpt",
  "chatId": "generated-chat-id",
  "response": "..."
}
```

## Full history

History is off by default.

- `history=true` returns the full simplified history
- `history=false` or omitting it returns only the latest response
- `full=true` is supported as an alias for `history=true`

Example:

```bash
curl "https://w3gpt.ai/api/skill?chatId=generated-chat-id&history=true"
```

## Optional parameters

- `chatId`: continue an existing chat (1-64 characters: letters, digits, `_` or `-`)
- `agentId`: use a different Web3GPT agent
- `message`: send a message by query string for small requests
- `history`: include the full history, defaults to `false`
- `full`: alias for `history`

## Notes

- If you call the endpoint without a `chatId`, a new chat is created automatically.
- If you call the endpoint without a `message`, you still get back a `chatId`.
- Deployments happen through the agent conversation. Tell the agent which chain to use.
- Polygon mainnet deployment is available through the agent/skill endpoint, not the wallet UI connectors.
- Server-side deployment returns only after a successful contract-creation receipt. The tool result includes the chain ID, contract address, transaction hash, contract explorer URL, and transaction explorer URL.
- Public aggregate deployment and custom-agent counts are available at `https://w3gpt.ai/api/stats`.

## Limits

The endpoint is public, so usage is metered:

- Messages that call the agent: 20 per IP and 30 per chat, every 10 minutes.
- Calls without a `message` (start a chat, read history): 120 per IP every 10 minutes.
- `message` may be up to 50,000 characters.
- Deployments paid for by Web3GPT's wallet: 10 testnet deployments per caller per hour, and 2 Polygon mainnet deployments per caller per day, under a shared daily mainnet budget. Once a limit is reached, the agent says so and suggests a testnet.

Over a limit, the endpoint returns HTTP `429` with a `Retry-After` header in seconds.
