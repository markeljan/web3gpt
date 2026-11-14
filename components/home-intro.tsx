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
      <h2>How it works</h2>
      <ol>
        <li>Describe the contract you want in plain English, or paste Solidity source into the chat.</li>
        <li>
          The agent writes the code, picks the solc version from the pragma, and compiles it, resolving imports from npm
          and GitHub.
        </li>
        <li>
          Deploy from your own wallet, or let the agent deploy for you. Agent deployments are paid for by Web3GPT and
          are rate limited.
        </li>
        <li>
          The deployment is recorded once the chain confirms it, and the contract is verified on the block explorer.
        </li>
      </ol>
      <h2>What you can build</h2>
      <p>
        Standard tokens such as ERC20, ERC721 and ERC1155, or any custom contract from source. Signed-in users can
        create custom agents with their own instructions and share them by link. Web3GPT is open source under the MIT
        license and runs in the browser at w3gpt.ai.
      </p>
      <h2>For AI agents</h2>
      <p>
        AI agents can use Web3GPT over a public HTTP API with no account or API key. Start with the{" "}
        <a href="/llms.txt">llms.txt overview</a>, the <a href="/skill.md">skill guide</a>, the{" "}
        <a href="/openapi.json">OpenAPI spec</a> or the <a href="/api-docs">API reference</a>. Every recorded deployment
        is listed on the <a href="/contracts">contracts dashboard</a>. Read more <a href="/about">about Web3GPT</a>, how
        to <a href="/contact">get in touch</a>, or the <a href="/privacy">privacy policy</a>.
      </p>
      <script
        // biome-ignore lint/security/noDangerouslySetInnerHtml: static JSON-LD built from constants above
        dangerouslySetInnerHTML={{ __html: JSON_LD }}
        type="application/ld+json"
      />
    </section>
  )
}
