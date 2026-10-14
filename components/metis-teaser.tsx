"use client"

import Link from "next/link"
import { metisSepolia } from "viem/chains"
import { useAccount } from "wagmi"
import { Button } from "@/components/ui/button"

export const MetisTeaser = () => {
  const { chain } = useAccount()

  if (chain?.id !== metisSepolia.id) {
    return null
  }

  return (
    <Button
      asChild
      className="transform rounded-full bg-linear-to-r from-purple-600 via-blue-500 to-indigo-400 px-4 py-2 font-bold text-white shadow-lg transition duration-300 ease-in-out hover:scale-105 hover:from-purple-700 hover:via-blue-600 hover:to-indigo-500"
    >
      <Link href="https://metis.fun" target="_blank">
        <span className="relative z-10">FUN</span>
        <div className="absolute inset-0 rounded-full bg-black opacity-10" />
        <div className="absolute inset-0 animate-pulse rounded-full bg-white opacity-10" />
      </Link>
    </Button>
  )
}
