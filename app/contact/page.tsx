import type { Metadata } from "next"
import { InfoPage, InfoSection, linkClass, listClass } from "@/components/info-page"

export const metadata: Metadata = {
  alternates: { canonical: "/contact" },
  description: "How to report a bug, request a feature, ask a question or make a privacy request about Web3GPT.",
  title: "Contact",
}

export default function ContactPage() {
  return (
    <InfoPage title="Contact Web3GPT">
      <p>
        Web3GPT is an open source project maintained by{" "}
        <a className={linkClass} href="https://x.com/soko_eth" rel="noopener" target="_blank">
          soko.eth
        </a>
        . There is no phone line or support desk. These are the channels to use, in order of preference.
      </p>

      <InfoSection title="Bugs and feature requests">
        <p>
          Open an issue on{" "}
          <a className={linkClass} href="https://github.com/markeljan/web3gpt/issues" rel="noopener" target="_blank">
            GitHub
          </a>
          . Include the chain, the transaction hash or contract address if you have one, and the steps that led to the
          problem. Issues are public, so leave out anything private. For problems with the HTTP API, include the request
          you sent and the error code in the response.
        </p>
      </InfoSection>

      <InfoSection title="Questions and everything else">
        <p>
          Message{" "}
          <a className={linkClass} href="https://x.com/w3gptai" rel="noopener" target="_blank">
            @w3gptai
          </a>{" "}
          on X. This is also the place for privacy requests, such as asking for your chats or custom agents to be
          deleted. The{" "}
          <a className={linkClass} href="/privacy">
            privacy policy
          </a>{" "}
          lists exactly what is stored and for how long.
        </p>
      </InfoSection>

      <InfoSection title="Before you write">
        <ul className={listClass}>
          <li>
            <a className={linkClass} href="/about">
              About Web3GPT
            </a>{" "}
            explains what the agent does, which chains it deploys to and who maintains it.
          </li>
          <li>
            <a className={linkClass} href="/skill.md">
              The skill guide
            </a>{" "}
            and the{" "}
            <a className={linkClass} href="/api-docs">
              API reference
            </a>{" "}
            cover the limits and error codes of the public API.
          </li>
          <li>
            <a className={linkClass} href="/contracts">
              The contracts page
            </a>{" "}
            lists every recorded deployment, which is the quickest way to check whether a deployment went through.
          </li>
        </ul>
      </InfoSection>
    </InfoPage>
  )
}
