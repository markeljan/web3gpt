import "server-only"
import { Resolution } from "@unstoppabledomains/resolution"

// Server-only: prefer the unprefixed name so the key is never inlined into client bundles.
// NEXT_PUBLIC_INFURA_API_KEY is kept as a fallback for existing deployments.
const INFURA_API_KEY = process.env.INFURA_API_KEY || process.env.NEXT_PUBLIC_INFURA_API_KEY

const resolution = new Resolution({
  sourceConfig: {
    ens: {
      network: "mainnet",
      url: `https://mainnet.infura.io/v3/${INFURA_API_KEY}`,
    },
    uns: {
      locations: {
        Layer1: {
          network: "mainnet",
          url: `https://mainnet.infura.io/v3/${INFURA_API_KEY}`,
        },
        Layer2: {
          network: "polygon-mainnet",
          url: `https://polygon-mainnet.infura.io/v3/${INFURA_API_KEY}`,
        },
      },
    },
    zns: {
      network: "mainnet",
      url: "https://api.zilliqa.com",
    },
  },
})

export const resolveDomain = async (domain: string, ticker = "ETH") => {
  const address = await resolution.addr(domain, ticker)
  return address
}

export const resolveAddress = async (address: string) => {
  const domain = await resolution.reverse(address)
  return domain
}
