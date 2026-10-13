import { NextResponse } from "next/server"
import { storeWalletDeployArtifact } from "@/lib/data/kv"
import { getClientIp, hitRateLimit, LIMITS, rateLimitHeaders } from "@/lib/rate-limit"
import { compileContractSource } from "@/lib/solidity/compile"

/** Generous for a single contract plus local imports; remote imports don't count. */
const MAX_SOURCE_BYTES = 500_000

export async function POST(request: Request) {
  // Compiling is CPU-heavy and resolves remote imports; it is open to anonymous
  // callers, so limit it per IP.
  const limit = await hitRateLimit(LIMITS.compile, getClientIp(request.headers))
  if (!limit.ok) {
    return NextResponse.json({ error: "Too many requests" }, { headers: rateLimitHeaders(limit), status: 429 })
  }

  try {
    const body = await request.json()
    const contractName = typeof body?.contractName === "string" ? body.contractName : ""
    const sourceCode = typeof body?.sourceCode === "string" ? body.sourceCode : ""
    const sources =
      body?.sources && typeof body.sources === "object" && !Array.isArray(body.sources) ? body.sources : undefined

    if (!(contractName && sourceCode)) {
      return NextResponse.json({ error: "contractName and sourceCode are required" }, { status: 400 })
    }

    const localSourceValues: unknown[] = sources ? Object.values(sources) : []
    if (localSourceValues.some((value) => typeof value !== "string")) {
      return NextResponse.json({ error: "sources must map file names to source strings" }, { status: 400 })
    }
    const totalBytes = sourceCode.length + (localSourceValues as string[]).reduce((sum, value) => sum + value.length, 0)
    if (totalBytes > MAX_SOURCE_BYTES) {
      return NextResponse.json({ error: "Source code is too large" }, { status: 413 })
    }

    const compiledContract = await compileContractSource({
      contractName,
      sourceCode,
      sources,
    })

    const artifactId = crypto.randomUUID()
    await storeWalletDeployArtifact(artifactId, {
      abi: compiledContract.abi,
      bytecode: compiledContract.bytecode,
      contractName,
      sources: compiledContract.sources,
      standardJsonInput: compiledContract.standardJsonInput,
    })

    return NextResponse.json({
      abi: compiledContract.abi,
      artifactId,
      bytecode: compiledContract.bytecode,
      standardJsonInput: compiledContract.standardJsonInput,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to compile contract" },
      { status: 500 }
    )
  }
}
