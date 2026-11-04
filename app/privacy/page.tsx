import type { Metadata } from "next"
import { InfoPage, InfoSection, linkClass, listClass } from "@/components/info-page"

export const metadata: Metadata = {
  alternates: { canonical: "/privacy" },
  description: "What data Web3GPT collects, why, who processes it, how long it is kept, and how to delete it.",
  title: "Privacy",
}

export default function PrivacyPage() {
  return (
    <InfoPage title="Privacy policy" updated="November 4, 2026">
      <p>
        Web3GPT keeps only what it needs to run the app and the public API. This page lists what that is. Anything you
        deploy to a blockchain or publish is public and permanent; treat it that way.
      </p>

      <InfoSection title="What we store">
        <ul className={listClass}>
          <li>
            <strong>Your GitHub account</strong>, if you sign in: your GitHub user id, name, avatar URL and email (when
            GitHub shares one). Sessions live in an encrypted cookie; there is no password.
          </li>
          <li>
            <strong>Chats.</strong> When you are signed in, browser chats are saved to your account until you delete
            them. Chats made without signing in are not saved. Chats through the skill API are saved under their{" "}
            <code>chatId</code> so the conversation can continue.
          </li>
          <li>
            <strong>Published chats and custom agents</strong> are public: anyone with the link can read them.
          </li>
          <li>
            <strong>Deployments.</strong> For each contract deployed through Web3GPT we record the chain, contract name,
            address, deployer address and transaction hash, and list them publicly on the contracts page. Sources, ABI
            and bytecode are uploaded to the public IPFS network and submitted to block explorers for verification.
          </li>
          <li>
            <strong>Product updates.</strong> If you subscribe, we keep your email address until you unsubscribe.
          </li>
          <li>
            <strong>IP addresses</strong> are used for rate limiting. The counters expire when their window ends, after
            at most a day.
          </li>
        </ul>
      </InfoSection>

      <InfoSection title="Who processes it">
        <ul className={listClass}>
          <li>OpenAI generates the agent&apos;s replies, so your messages are sent to it.</li>
          <li>Upstash stores chats, accounts, deployment records and rate-limit counters.</li>
          <li>Pinata pins contract artifacts to public IPFS.</li>
          <li>Etherscan and Blockscout receive contract sources for verification.</li>
          <li>Vercel hosts the app and provides Vercel Web Analytics (aggregate page views, no cookies).</li>
          <li>WalletConnect (Reown) relays connections when you connect a wallet.</li>
          <li>GitHub handles sign-in.</li>
        </ul>
        <p>We do not sell data or use it for advertising.</p>
      </InfoSection>

      <InfoSection title="Cookies and local storage">
        <p>
          A session cookie keeps you signed in, and a cookie remembers your wallet connection. Your theme and a few UI
          preferences are kept in your browser&apos;s local storage.
        </p>
      </InfoSection>

      <InfoSection title="Deleting your data">
        <p>
          Delete or clear chats from the sidebar and user menu, and unsubscribe from updates in the user menu. To delete
          your account record, custom agents or skill API chats,{" "}
          <a className={linkClass} href="/about#contact">
            contact us
          </a>
          . Data written to a blockchain, IPFS or a block explorer cannot be deleted by anyone.
        </p>
      </InfoSection>
    </InfoPage>
  )
}
