import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import type { Chain, Hash } from "viem"
import { getChainDetails } from "@/lib/config"

export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs))

const SECOND_IN_MS = 1000
const TRAILING_SLASH_REGEX = /\/+$/

export const formatDate = (input: string | number | Date): string => {
  let date: Date

  if (typeof input === "number") {
    // treat 10 digit numbers as unix timestamps (seconds)
    if (input.toString().length === 10) {
      date = new Date(input * SECOND_IN_MS)
    } else {
      // assume milliseconds
      date = new Date(input)
    }
  } else if (typeof input === "string") {
    date = new Date(input)
  } else if (input instanceof Date) {
    date = input
  } else {
    date = new Date()
  }

  return date.toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

export const getIpfsUrl = (cid: string): string => `${process.env.NEXT_PUBLIC_IPFS_GATEWAY}/ipfs/${cid}`

const HASH_PREFIX_REGEX = /^0x/
export function ensureHashPrefix(bytecode: string | Hash): Hash {
  return `0x${bytecode.replace(HASH_PREFIX_REGEX, "")}`
}

export function getExplorerUrl({
  viemChain,
  hash,
  type,
}: {
  viemChain: Chain
  hash: Hash
  type: "tx" | "address"
}): string {
  const { explorerUrl } = getChainDetails(viemChain)
  const normalizedExplorerUrl = explorerUrl.replace(TRAILING_SLASH_REGEX, "")

  if (!normalizedExplorerUrl) {
    return ""
  }
  if (type === "tx") {
    return `${normalizedExplorerUrl}/tx/${hash}`
  }

  return `${normalizedExplorerUrl}/address/${hash}`
}
