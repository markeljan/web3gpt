import "server-only"
import type { Chain } from "viem"
import { getChainDetails } from "@/lib/config"
import { getVerificationCompilerVersion } from "@/lib/solidity/compiler-version"
import type { VerifyContractParams } from "@/lib/types"

type VerifyApiResponse = {
  status: string
  result: string
  message?: string
}

const MIT_LICENSE_TYPE = "3"

export const verifyContract = async ({
  contractAddress,
  standardJsonInput,
  encodedConstructorArgs,
  fileName,
  contractName,
  compilerVersion,
  viemChain,
}: VerifyContractParams): Promise<VerifyApiResponse> => {
  const { explorerApiUrl, explorerApiKey, explorerType } = getChainDetails(viemChain)

  if (!explorerApiUrl) {
    throw new Error(`No explorer API URL configured for ${viemChain.name} (${viemChain.id})`)
  }

  if (!explorerApiKey) {
    throw new Error(`No explorer API key configured for ${viemChain.name} (${viemChain.id})`)
  }

  const params = new URLSearchParams()
  if (explorerType === "etherscan") {
    params.append("chainid", String(viemChain.id))
  }
  params.append("module", "contract")
  params.append("action", "verifysourcecode")
  params.append("contractaddress", contractAddress)
  params.append("sourceCode", JSON.stringify(standardJsonInput))
  params.append("codeformat", "solidity-standard-json-input")
  params.append("contractname", `${fileName}:${contractName}`)
  params.append("compilerversion", getVerificationCompilerVersion(compilerVersion))
  if (encodedConstructorArgs) {
    params.append("constructorArguments", encodedConstructorArgs)
  }
  params.append("optimizationUsed", "1")
  params.append("runs", "200")
  params.append("licenseType", MIT_LICENSE_TYPE)
  params.append("apikey", explorerApiKey)

  const response = await fetch(explorerApiUrl, {
    body: params.toString(),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    method: "POST",
  })

  if (!response.ok) {
    throw new Error(`Explorer API request failed with status ${response.status}`)
  }

  return await response.json()
}

export const checkVerifyStatus = async (guid: string, viemChain: Chain): Promise<VerifyApiResponse> => {
  const { explorerApiUrl, explorerApiKey, explorerType } = getChainDetails(viemChain)

  if (!explorerApiUrl) {
    throw new Error(`No explorer API URL configured for ${viemChain.name} (${viemChain.id})`)
  }

  if (!explorerApiKey) {
    throw new Error(`No explorer API key configured for ${viemChain.name} (${viemChain.id})`)
  }

  const params = new URLSearchParams()
  if (explorerType === "etherscan") {
    params.append("chainid", String(viemChain.id))
  }
  params.append("apikey", explorerApiKey)
  params.append("module", "contract")
  params.append("action", "checkverifystatus")
  params.append("guid", guid)

  const response = await fetch(explorerApiUrl, {
    body: params.toString(),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    method: "POST",
  })

  if (!response.ok) {
    throw new Error(`Explorer API request failed with status ${response.status}`)
  }

  return await response.json()
}
