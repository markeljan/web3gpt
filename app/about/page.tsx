import type { Metadata } from "next"
import { InfoPage, InfoSection, linkClass, listClass } from "@/components/info-page"

export const metadata: Metadata = {
  alternates: { canonical: "/about" },
  description: "What Web3GPT is, how it works, who maintains it, and how to get in touch.",
  title: "About",
}

export default function AboutPage() {
  return (
    <InfoPage title="About Web3GPT">
      <InfoSection title="What it is">
        <p>
          Web3GPT is an AI agent for smart contracts. You describe a contract in plain English or paste Solidity, and
          the agent writes it, compiles it with the right compiler version, deploys it to an EVM chain and verifies it
          on the block explorer. It runs in the browser at w3gpt.ai, and other AI agents use it through a public HTTP
          API.
        </p>
      </InfoSection>

      <InfoSection title="How it works">
        <ul className={listClass}>
          <li>
            Contracts can import OpenZeppelin and other packages from npm or GitHub. The compiler version is chosen from
            the contract&apos;s <code>pragma</code>.
          </li>
          <li>
            You can deploy from your own wallet, or let the agent deploy for you on Polygon, Polygon Amoy and several
            testnets. Agent deployments are paid for by Web3GPT and are rate limited.
          </li>
          <li>
            Each deployment is recorded only after the chain confirms it. Sources, ABI and bytecode are pinned to IPFS,
            and every deployment is listed on the{" "}
            <a className={linkClass} href="/contracts">
              contracts page
            </a>
            .
          </li>
          <li>Signed-in users can create custom agents with their own instructions and share them by link.</li>
        </ul>
      </InfoSection>

      <InfoSection title="For AI agents and developers">
        <p>
          Start with{" "}
          <a className={linkClass} href="/llms.txt">
            llms.txt
          </a>{" "}
          or the{" "}
          <a className={linkClass} href="/skill.md">
            skill guide
          </a>
          . The{" "}
          <a className={linkClass} href="/api-docs">
            API reference
          </a>{" "}
          covers every endpoint. No account or API key is needed.
        </p>
      </InfoSection>

      <InfoSection title="Who maintains it">
        <p>
          Web3GPT is open source under the MIT license and maintained by{" "}
          <a className={linkClass} href="https://x.com/soko_eth" rel="noopener" target="_blank">
            soko.eth
          </a>
          . The code is on{" "}
          <a className={linkClass} href="https://github.com/markeljan/web3gpt" rel="noopener" target="_blank">
            GitHub
          </a>
          .
        </p>
      </InfoSection>

      <InfoSection id="contact" title="Contact">
        <ul className={listClass}>
          <li>
            Bugs and feature requests:{" "}
            <a className={linkClass} href="https://github.com/markeljan/web3gpt/issues" rel="noopener" target="_blank">
              GitHub issues
            </a>
          </li>
          <li>
            Everything else, including privacy requests:{" "}
            <a className={linkClass} href="https://x.com/w3gptai" rel="noopener" target="_blank">
              @w3gptai
            </a>{" "}
            on X
          </li>
        </ul>
        <p>
          See the{" "}
          <a className={linkClass} href="/privacy">
            privacy policy
          </a>{" "}
          for what data Web3GPT keeps.
        </p>
      </InfoSection>
    </InfoPage>
  )
}
