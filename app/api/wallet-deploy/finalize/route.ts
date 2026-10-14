import { track } from "@vercel/analytics/server"
import { NextResponse } from "next/server"
import { createPublicClient, type Hash, isHash } from "viem"
import { getSession } from "@/lib/auth"
import { getChainById } from "@/lib/config"
import { ipfsUploadDir } from "@/lib/data/ipfs"
import {
  claimWalletDeployArtifact,
  deleteWalletDeployArtifact,
  getWalletDeployArtifact,
  releaseWalletDeployArtifactClaim,
  storeDeployment,
  storeVerification,
} from "@/lib/data/kv"
import { getClientIp, hitRateLimit, LIMITS, rateLimitHeaders } from "@/lib/rate-limit"
import { getDeploymentTransport } from "@/lib/solidity/deployment-transport"
import { getContractFileName } from "@/lib/solidity/utils"
import {
  type VerifiedWalletDeployment,
  verifyWalletDeployment,
  WalletDeploymentMismatchError,
} from "@/lib/solidity/wallet-deployment"
import type { ChainWithIcon, VerifyContractParams, WalletDeployArtifact } from "@/lib/types"
import { getExplorerUrl, getIpfsUrl } from "@/lib/utils"

const RECEIPT_TIMEOUT_MS = 30_000

export async function POST(request: Request) {
  const limit = await hitRateLimit(LIMITS.finalize, getClientIp(request.headers))
  if (!limit.ok) {
    return NextResponse.json({ error: "Too many requests" }, { headers: rateLimitHeaders(limit), status: 429 })
  }

  try {
    const body = await request.json()
    const artifactId = typeof body?.artifactId === "string" ? body.artifactId : ""
    const deployHash = typeof body?.deployHash === "string" ? body.deployHash : ""
    const claimedContractAddress = typeof body?.contractAddress === "string" ? body.contractAddress : undefined
    const chainId = Number(body?.chainId)

    if (!(artifactId && isHash(deployHash) && Number.isFinite(chainId))) {
      return NextResponse.json({ error: "artifactId, deployHash and chainId are required" }, { status: 400 })
    }

    const artifact = await getWalletDeployArtifact(artifactId)
    if (!artifact) {
      return NextResponse.json({ error: "Deployment artifact not found or expired" }, { status: 404 })
    }

    const viemChain = getChainById(chainId)
    if (!viemChain) {
      return NextResponse.json({ error: `Chain ${chainId} not found` }, { status: 400 })
    }

    // Everything recorded below comes from the chain, not from the request body.
    const publicClient = createPublicClient({ chain: viemChain, transport: getDeploymentTransport(viemChain) })
    const [receipt, transaction] = await Promise.all([
      publicClient.waitForTransactionReceipt({ hash: deployHash as Hash, timeout: RECEIPT_TIMEOUT_MS }),
      publicClient.getTransaction({ hash: deployHash as Hash }),
    ])

    let verified: ReturnType<typeof verifyWalletDeployment>
    try {
      verified = verifyWalletDeployment(
        { receipt, transaction: { from: transaction.from, input: transaction.input, to: transaction.to } },
        { artifactBytecode: artifact.bytecode, claimedContractAddress }
      )
    } catch (error) {
      if (error instanceof WalletDeploymentMismatchError) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }
      throw error
    }

    // One artifact, one recording. The lock covers the slow IPFS upload; the
    // artifact itself is only deleted once everything is stored, so a failed
    // upload can be retried.
    if (!(await claimWalletDeployArtifact(artifactId))) {
      return NextResponse.json({ error: "This deployment is already being recorded" }, { status: 409 })
    }
    try {
      return await recordDeployment({
        artifact,
        artifactId,
        chainId,
        deployHash: deployHash as Hash,
        verified,
        viemChain,
      })
    } finally {
      await releaseWalletDeployArtifactClaim(artifactId)
    }
  } catch (error) {
    console.error("wallet deploy finalize failed", error)
    return NextResponse.json({ error: "Failed to finalize wallet deployment" }, { status: 500 })
  }
}

async function recordDeployment({
  artifact,
  artifactId,
  chainId,
  deployHash,
  verified,
  viemChain,
}: {
  artifact: WalletDeployArtifact
  artifactId: string
  chainId: number
  deployHash: Hash
  verified: VerifiedWalletDeployment
  viemChain: ChainWithIcon
}) {
  const cid = await ipfsUploadDir(artifact.sources, artifact.abi, artifact.bytecode, artifact.standardJsonInput)
  if (!cid) {
    return NextResponse.json({ error: "Failed to upload contract artifacts to IPFS" }, { status: 500 })
  }

  const session = await getSession()
  const userId = session?.user?.id || "anon"
  const { contractAddress, deployerAddress, encodedConstructorArgs } = verified
  const explorerUrl = getExplorerUrl({
    hash: contractAddress,
    type: "address",
    viemChain,
  })
  const ipfsUrl = getIpfsUrl(cid)

  const verifyContractConfig: VerifyContractParams = {
    // Artifacts prepared before compiler selection have no version; the verifier
    // then uses LEGACY_COMPILER_VERSION (0.8.29), which is what they were compiled with.
    ...(artifact.compilerVersion ? { compilerVersion: artifact.compilerVersion } : {}),
    contractAddress,
    contractName: artifact.contractName,
    deployHash,
    encodedConstructorArgs,
    fileName: getContractFileName(artifact.contractName),
    standardJsonInput: artifact.standardJsonInput,
    viemChain: {
      blockExplorers: viemChain.blockExplorers,
      id: viemChain.id,
      name: viemChain.name,
      nativeCurrency: viemChain.nativeCurrency,
      rpcUrls: viemChain.rpcUrls,
    },
  }

  await Promise.all([
    storeDeployment(
      {
        chainId,
        cid,
        contractAddress,
        contractName: artifact.contractName,
        deployerAddress,
        deployHash,
      },
      userId
    ),
    storeVerification(verifyContractConfig),
  ])

  await deleteWalletDeployArtifact(artifactId)

  Promise.resolve(
    track("deployed_contract", {
      contractAddress,
      contractName: artifact.contractName,
      explorerUrl,
    })
  ).catch(() => undefined)

  return NextResponse.json({
    explorerUrl,
    ipfsUrl,
    verifyContractConfig,
  })
}
