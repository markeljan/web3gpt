import { APP_URL } from "@/lib/config"

const DESCRIPTION =
  "Web3GPT is an AI agent that writes, compiles, deploys and verifies Solidity smart contracts on EVM chains."

// Structured identity for search engines and agents (schema.org SoftwareApplication).
const JSON_LD = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  applicationCategory: "DeveloperApplication",
  description: DESCRIPTION,
  name: "Web3GPT",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  operatingSystem: "Web",
  sameAs: ["https://github.com/markeljan/web3gpt", "https://x.com/w3gptai"],
  url: APP_URL,
})

/**
 * What the homepage is, in server-rendered HTML. The chat UI is interactive and
 * says little without JavaScript, so crawlers and agents that read raw HTML get
 * this instead. It is visually hidden, but screen readers announce it too.
 */
export function HomeIntro() {
  return (
    <section className="sr-only">
      <h1>Web3GPT: deploy smart contracts with AI</h1>
      <p>
        {DESCRIPTION} Describe a contract in plain English or paste Solidity source, and the agent compiles it with the
        right solc version, resolves OpenZeppelin and other npm or GitHub imports, deploys it, and verifies it on the
        block explorer. Deploy from your own wallet, or let the agent deploy to Polygon, Polygon Amoy, Ethereum Sepolia,
        Base Sepolia, Arbitrum Sepolia, OP Sepolia, Mantle Sepolia, Metis Sepolia or Celo Sepolia. Sources, ABI and
        bytecode are pinned to IPFS.
      </p>
      <p>
        AI agents can use Web3GPT over a public HTTP API with no account or API key. Start with the{" "}
        <a href="/llms.txt">llms.txt overview</a>, the <a href="/skill.md">skill guide</a>, the{" "}
        <a href="/openapi.json">OpenAPI spec</a> or the <a href="/api-docs">API reference</a>. Every recorded deployment
        is listed on the <a href="/contracts">contracts dashboard</a>.
      </p>
      <script
        // biome-ignore lint/security/noDangerouslySetInnerHtml: static JSON-LD built from constants above
        dangerouslySetInnerHTML={{ __html: JSON_LD }}
        type="application/ld+json"
      />
    </section>
  )
}
