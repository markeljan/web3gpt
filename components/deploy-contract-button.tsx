"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useAccount, useChains } from "wagmi"
import { useGlobalStore } from "@/app/state/global-store"
import { IconExternalLink, IconSpinner } from "@/components/icons"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useWalletDeploy } from "@/lib/hooks/use-wallet-deploy"

const CONTRACT_NAME_REGEX = /contract\s+(\w+)\s*(?:is|{)/
const CONSTRUCTOR_ARGS_REGEX = /constructor\(([^)]+)\)/

export const DeployContractButton = ({ sourceCode, disabled = false }: { disabled?: boolean; sourceCode: string }) => {
  const { deploy: deployWithWallet } = useWalletDeploy()
  const [explorerUrl, setExplorerUrl] = useState<string>("")
  const [ipfsUrl, setIpfsUrl] = useState<string>("")
  const [constructorArgValues, setConstructorArgValues] = useState<string[]>([])
  const [constructorArgNames, setConstructorArgNames] = useState<string[]>([])
  const [isErrorDeploying, setIsErrorDeploying] = useState<boolean>(false)
  const { isDeploying, setIsDeploying } = useGlobalStore()
  const supportedChains = useChains()
  const { chain } = useAccount()
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  const isSupportedChain = useMemo(
    () => !!chain && supportedChains.find((c) => c.id === chain.id),
    [chain, supportedChains]
  )

  const generateConstructorArgs = useCallback(() => {
    const constructorArgsMatch = CONSTRUCTOR_ARGS_REGEX.exec(sourceCode)
    if (!constructorArgsMatch) {
      return []
    }
    const [, constructorArgs] = constructorArgsMatch
    const constructorArgsArray = constructorArgs.split(",")
    return constructorArgsArray.map((arg) => arg.trim())
  }, [sourceCode])

  useEffect(() => {
    const args = generateConstructorArgs()
    setConstructorArgNames(args.map((arg) => arg.split(" ").pop() || ""))
    setConstructorArgValues(args.map(() => ""))
  }, [generateConstructorArgs])

  const handleInputChange = useCallback((index: number, value: string) => {
    setConstructorArgValues((prev) => {
      const newValues = [...prev]
      newValues[index] = value
      return newValues
    })
  }, [])

  const generatedConstructorFields = useMemo(
    () =>
      constructorArgNames.map((arg, index) => (
        <div className="flex flex-col gap-2" key={`${arg}`}>
          <Label className="font-medium text-sm">{arg}</Label>
          <Input
            className="rounded-md border border-gray-300 p-2"
            onChange={(e) => {
              e.preventDefault()
              handleInputChange(index, e.target.value)
            }}
            placeholder={arg}
            type="text"
            value={constructorArgValues[index]}
          />
        </div>
      )),
    [constructorArgNames, constructorArgValues, handleInputChange]
  )

  const handleClickDeploy = useCallback(async () => {
    setIsDeploying(true)
    setIsErrorDeploying(false)

    const contractNameMatch = CONTRACT_NAME_REGEX.exec(sourceCode)
    const contractName = contractNameMatch ? contractNameMatch[1] : ""
    try {
      const deploymentData = await deployWithWallet({
        constructorArgs: constructorArgValues,
        contractName,
        sourceCode,
      })
      if (!deploymentData) {
        setIsErrorDeploying(true)
        setIsDeploying(false)
        return
      }

      const { explorerUrl: newExplorerUrl, ipfsUrl: newIpfsUrl } = deploymentData
      if (!(newExplorerUrl && newIpfsUrl)) {
        setIsErrorDeploying(true)
        setIsDeploying(false)
        return
      }
      if (newExplorerUrl) {
        setExplorerUrl(newExplorerUrl)
      }
      if (newIpfsUrl) {
        setIpfsUrl(newIpfsUrl)
      }

      setIsDeploying(false)
    } catch {
      setIsErrorDeploying(true)
      setIsDeploying(false)
    }
  }, [deployWithWallet, constructorArgValues, sourceCode, setIsDeploying])

  return (
    <div className="ml-4 flex w-full justify-end">
      <Dialog
        onOpenChange={(isOpen) => {
          setIsDialogOpen(isOpen)
          if (!(isOpen || isDeploying)) {
            setIsErrorDeploying(false)
          }
        }}
        open={isDialogOpen}
      >
        <DialogTrigger asChild>
          <Button
            className="mr-2 bg-primary/80 text-primary-foreground hover:bg-primary"
            disabled={disabled || !isSupportedChain}
            onClick={() => {
              setIsDialogOpen(true)
            }}
            size="sm"
            variant="default"
          >
            <p className="hidden sm:flex">Deploy Contract</p>
            <p className="flex sm:hidden">Deploy</p>
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Manually Deploy Contract</DialogTitle>
            <DialogDescription>
              Deploy the contract using your wallet. Must be connected to a supported testnet.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-2">
              <div className="flex">
                <p className="font-medium text-sm">Agent Deploy</p>
                <Badge className="ml-2 rounded" variant="default">
                  RECOMMENDED
                </Badge>
              </div>
              <p className="text-gray-500 text-sm">
                {`This method does not require wallet connection. Just use the keyword "deploy" in the chat.`}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex">
                <p className="font-medium text-sm">Deploy with Wallet</p>
                <Badge className="ml-2 rounded" variant="destructive">
                  ADVANCED
                </Badge>
              </div>
              <p className="text-gray-500 text-sm">
                Sign and deploy the contract using your own wallet. Be cautious of risks and network fees.
              </p>
            </div>
            {constructorArgNames.length > 0 ? (
              <div className="flex max-h-48 flex-col gap-4 overflow-y-auto rounded border-2 p-4">
                <DialogTitle className="text-md">Constructor Arguments</DialogTitle>
                {generatedConstructorFields}
              </div>
            ) : null}
          </div>
          <div className="flex flex-col items-center gap-4">
            {isErrorDeploying ? <p className="text-destructive text-sm">Error deploying contract.</p> : null}
            {isDeploying ? <IconSpinner className="size-8 animate-spin text-gray-500" /> : null}
            {explorerUrl ? (
              <Link className="text-green-500 text-sm" href={explorerUrl} rel="noopener noreferrer" target="_blank">
                <div className="flex items-center">
                  View on Explorer
                  <IconExternalLink className="ml-1" />
                </div>
              </Link>
            ) : null}
            {ipfsUrl ? (
              <Link className="text-blue-500 text-sm" href={ipfsUrl} rel="noopener noreferrer" target="_blank">
                <div className="flex items-center">
                  View on IPFS
                  <IconExternalLink className="ml-1" />
                </div>
              </Link>
            ) : null}
          </div>

          <DialogFooter>
            <Button className="mb-4 p-6 sm:p-4" disabled={isDeploying} onClick={handleClickDeploy} variant="secondary">
              Deploy with Wallet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
