import "server-only"
import { PinataSDK } from "pinata"
import type { SolcOutput } from "solc"
import type { Abi } from "viem"
import { IPFS_W3GPT_GROUP_ID } from "@/lib/constants"

const CURRENT_DIR_PREFIX = "./"
const PARENT_DIR_PREFIX = "../"

// The SDK expects a bare gateway domain, while NEXT_PUBLIC_IPFS_GATEWAY carries the protocol
// so it can be used directly when building public URLs in getIpfsUrl.
const pinata = new PinataSDK({
  pinataGateway: process.env.NEXT_PUBLIC_IPFS_GATEWAY?.replace(/^https?:\/\//u, ""),
  pinataJwt: process.env.PINATA_JWT,
})

function getSafeIpfsFileName(fileName: string) {
  const normalizedFileName = fileName.replaceAll("\\", "/")

  if (normalizedFileName.startsWith(CURRENT_DIR_PREFIX)) {
    return `imports/${normalizedFileName.slice(CURRENT_DIR_PREFIX.length)}`
  }

  if (normalizedFileName.startsWith(PARENT_DIR_PREFIX)) {
    return `imports/${normalizedFileName.replaceAll(PARENT_DIR_PREFIX, "up/")}`
  }

  return normalizedFileName
}

export async function ipfsUploadDir(
  sources: SolcOutput["sources"],
  abi: Abi,
  bytecode: string,
  standardJsonInput: string
): Promise<string | null> {
  try {
    const files: File[] = []

    for (const [fileName, { content }] of Object.entries(sources)) {
      files.push(new File([content], getSafeIpfsFileName(fileName)))
    }
    files.push(new File([JSON.stringify(abi, null, 2)], "abi.json"))
    files.push(new File([bytecode], "bytecode.txt"))
    files.push(new File([standardJsonInput], "standardJsonInput.json"))

    const { cid } = await pinata.upload.public
      .fileArray(files)
      .group(IPFS_W3GPT_GROUP_ID)
      .name("contract")
      .cidVersion("v1")

    return cid
  } catch (error) {
    console.error("ipfsUploadDir failed", error)
    return null
  }
}

export async function ipfsUploadFile(fileName: string, fileContent: string): Promise<string | null> {
  try {
    const file = new File([fileContent], fileName)
    const { cid } = await pinata.upload.public.file(file).group(IPFS_W3GPT_GROUP_ID).name(fileName).cidVersion("v1")

    return cid
  } catch (error) {
    console.error("ipfsUploadFile failed", error)
    return null
  }
}
