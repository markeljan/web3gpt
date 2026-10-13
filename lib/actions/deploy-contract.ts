import "server-only"
import { compileContractSource } from "@/lib/solidity/compile"

// Plain server-only module. It used to be marked "use server", which can expose
// every export as a public, unauthenticated server action endpoint, including
// two unused helpers that pinned arbitrary files to the project's Pinata account.
export async function compileContract({
  contractName,
  sourceCode,
  sources: additionalSources,
}: {
  contractName: string
  sourceCode: string
  sources?: Record<string, string>
}) {
  return await compileContractSource({
    contractName,
    sourceCode,
    sources: additionalSources,
  })
}
