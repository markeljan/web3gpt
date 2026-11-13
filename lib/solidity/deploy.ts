import "server-only"
import { track } from "@vercel/analytics/server"
import { createWalletClient, encodeDeployData, publicActions } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { compileContract } from "@/lib/actions/deploy-contract"
import { storeDeploymentAction, storeVerificationAction } from "@/lib/actions/verification"
import { getChainById } from "@/lib/config"
import { ipfsUploadDir } from "@/lib/data/ipfs"
import { getDeployedContractAddress } from "@/lib/solidity/deployment-receipt"
import { getDeploymentTransport } from "@/lib/solidity/deployment-transport"
import { getContractFileName } from "@/lib/solidity/utils"
import type { DeployContractParams, DeployContractResult, VerifyContractParams } from "@/lib/types"
import { getExplorerUrl, getIpfsUrl } from "@/lib/utils"

let cachedDeployerAccount: ReturnType<typeof privateKeyToAccount> | undefined

const getDeployerAccount = () => {
  if (cachedDeployerAccount) {
    return cachedDeployerAccount
  }

  const privateKey = process.env.DEPLOYER_PRIVATE_KEY
  if (!privateKey) {
    throw new Error("DEPLOYER_PRIVATE_KEY is not set")
  }

  cachedDeployerAccount = privateKeyToAccount(`0x${privateKey}`)
  return cachedDeployerAccount
}
const DEPLOYMENT_RECEIPT_TIMEOUT_MS = 45_000

export const deployContract = async ({
  chainId,
  contractName,
  sourceCode,
  constructorArgs,
  imports,
}: DeployContractParams): Promise<DeployContractResult> => {
  const deployerAccount = getDeployerAccount()
  const viemChain = getChainById(Number(chainId))

  if (!viemChain) {
    throw new Error(`Chain ${chainId} not found`)
  }

  const { abi, bytecode, compilerVersion, standardJsonInput, sources } = await compileContract({
    contractName,
    sourceCode,
    sources: imports,
  })

  const walletClient = createWalletClient({
    account: deployerAccount,
    chain: viemChain,
    transport: getDeploymentTransport(viemChain),
  }).extend(publicActions)

  if (!(await walletClient.getAddresses())) {
    const error = new Error(`Wallet for chain ${viemChain.name} not available`)
    throw error
  }

  const deployerAddress = deployerAccount.address

  const deployData = encodeDeployData({
    abi,
    args: constructorArgs,
    bytecode,
  })

  const deployHash = await walletClient.deployContract({
    abi,
    account: deployerAccount,
    args: constructorArgs,
    bytecode,
  })

  const receipt = await walletClient.waitForTransactionReceipt({
    confirmations: 1,
    hash: deployHash,
    timeout: DEPLOYMENT_RECEIPT_TIMEOUT_MS,
  })

  const contractAddress = getDeployedContractAddress(receipt, viemChain.name)

  const explorerUrl = getExplorerUrl({
    hash: contractAddress,
    type: "address",
    viemChain,
  })
  const transactionExplorerUrl = getExplorerUrl({
    hash: deployHash,
    type: "tx",
    viemChain,
  })

  const cid = await ipfsUploadDir(sources, abi, bytecode, standardJsonInput)
  if (!cid) {
    throw new Error("Error uploading to IPFS")
  }

  const ipfsUrl = getIpfsUrl(cid)

  const encodedConstructorArgs = deployData.slice(bytecode?.length)
  const fileName = getContractFileName(contractName)

  const verifyContractConfig: VerifyContractParams = {
    compilerVersion,
    contractAddress,
    contractName,
    deployHash,
    encodedConstructorArgs,
    fileName,
    standardJsonInput,
    viemChain,
  }

  const deploymentData: DeployContractResult = {
    abi,
    chainId,
    contractAddress,
    explorerUrl,
    ipfsUrl,
    sourceCode,
    standardJsonInput,
    transactionExplorerUrl,
    transactionHash: deployHash,
    verifyContractConfig,
  }

  await Promise.all([
    storeDeploymentAction({
      chainId,
      cid,
      contractAddress,
      contractName,
      deployerAddress,
      deployHash,
    }),
    storeVerificationAction(verifyContractConfig),
    track("deployed_contract", {
      contractAddress,
      contractName,
      explorerUrl,
      transactionHash: deployHash,
    }),
  ])

  return deploymentData
}
