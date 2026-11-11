import { useCallback } from "react"
import { toast } from "sonner"
import { type Abi, encodeDeployData, type Hash, publicActions } from "viem"
import { useAccount, useWalletClient } from "wagmi"
import { useGlobalStore } from "@/app/state/global-store"
import type { LastDeploymentData, VerifyContractParams } from "@/lib/types"
import { getExplorerUrl } from "@/lib/utils"

export function useWalletDeploy() {
  const { chain: viemChain, address, chainId } = useAccount()
  const { setLastDeploymentData } = useGlobalStore()
  const { data } = useWalletClient({
    chainId,
  })
  const walletClient = data?.extend(publicActions)

  const deploy = useCallback(
    async ({
      contractName,
      sourceCode,
      constructorArgs,
      imports,
    }: {
      contractName: string
      sourceCode: string
      constructorArgs: string[]
      imports?: Record<string, string>
    }) => {
      if (!(viemChain && walletClient && address && chainId)) {
        return
      }
      const deployLoadingToast = toast.loading("Deploying contract...")

      try {
        const prepareResponse = await fetch("/api/wallet-deploy/prepare", {
          body: JSON.stringify(
            imports
              ? {
                  contractName,
                  sourceCode,
                  sources: imports,
                }
              : {
                  contractName,
                  sourceCode,
                }
          ),
          headers: {
            "Content-Type": "application/json",
          },
          method: "POST",
        })
        const prepareResult = (await prepareResponse.json()) as {
          abi?: Abi
          artifactId?: string
          bytecode?: Hash
          error?: string
          standardJsonInput?: string
        }

        if (
          !(prepareResponse.ok && prepareResult.artifactId && prepareResult.bytecode && prepareResult.standardJsonInput)
        ) {
          throw new Error(prepareResult.error || "Failed to compile contract")
        }

        const { abi = [], artifactId, bytecode, standardJsonInput } = prepareResult

        const parsedConstructorArgs = constructorArgs.map((arg) => {
          if (arg.startsWith("[") && arg.endsWith("]") && /(?<=\[)(?=[^"'])(?:.*)(?<=[^"'])(?=\])/gu.test(arg)) {
            return arg
              .slice(1, -1)
              .split(",")
              .map((item) => item.trim())
          }
          try {
            return JSON.parse(arg)
          } catch {
            return arg
          }
        })

        const deployData = encodeDeployData({
          abi,
          args: parsedConstructorArgs,
          bytecode,
        })

        const deployHash = await walletClient.deployContract({
          abi,
          account: address,
          args: parsedConstructorArgs,
          bytecode,
          value: 0n,
        })

        if (!deployHash) {
          toast.error("Failed to deploy contract")
          return
        }

        const encodedConstructorArgs = deployData.slice(bytecode.length)

        const transactionReceipt = await walletClient.waitForTransactionReceipt({
          hash: deployHash,
        })

        if (transactionReceipt.status !== "success") {
          toast.error("Failed to receive enough confirmations")
          return
        }

        const { contractAddress } = transactionReceipt
        if (!contractAddress) {
          throw new Error("The transaction succeeded but did not create a contract")
        }

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

        const finalizeLoadingToast = toast.loading("Uploading to IPFS and queuing verification...")
        const finalizeResponse = await fetch("/api/wallet-deploy/finalize", {
          body: JSON.stringify({
            artifactId,
            chainId,
            contractAddress,
            deployerAddress: address,
            deployHash,
            encodedConstructorArgs,
          }),
          headers: {
            "Content-Type": "application/json",
          },
          method: "POST",
        })
        const finalizeResult = (await finalizeResponse.json()) as {
          error?: string
          explorerUrl?: string
          ipfsUrl?: string
          verifyContractConfig?: VerifyContractParams
        }
        toast.dismiss(finalizeLoadingToast)

        if (!(finalizeResponse.ok && finalizeResult.ipfsUrl && finalizeResult.verifyContractConfig)) {
          throw new Error(finalizeResult.error || "Contract deployed, but failed to persist metadata")
        }

        toast.success("Uploaded to IPFS successfully!")

        const deploymentData: LastDeploymentData = {
          abi,
          chainId,
          contractAddress,
          explorerUrl: finalizeResult.explorerUrl || explorerUrl,
          ipfsUrl: finalizeResult.ipfsUrl,
          sourceCode,
          standardJsonInput,
          transactionExplorerUrl,
          transactionHash: deployHash,
          verifyContractConfig: finalizeResult.verifyContractConfig,
          walletAddress: address,
        }

        setLastDeploymentData(deploymentData)
        toast.success("Contract deployed successfully!")
        return deploymentData
      } catch (error) {
        const message = error instanceof Error ? error.message.split("\n")[0] : "Failed to deploy contract"
        toast.error(message)
      } finally {
        toast.dismiss(deployLoadingToast)
      }
    },
    [viemChain, walletClient, address, setLastDeploymentData, chainId]
  )

  return { deploy }
}
