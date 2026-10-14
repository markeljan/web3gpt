import type { Hash } from "viem"

/**
 * Checks a wallet deployment against the chain instead of trusting the client.
 *
 * The finalize route records deployments in the public analytics and queues
 * them for explorer verification, so it must only accept a transaction that
 * (1) succeeded, (2) created a contract, and (3) deployed exactly the artifact
 * this server compiled, i.e. its input starts with that bytecode. Everything
 * stored is read from the chain, including the deployer and the constructor
 * arguments, which are the input after the bytecode.
 */

export type ChainDeploymentEvidence = {
  transaction: { input: Hash; from: Hash; to: Hash | null }
  receipt: { status: "success" | "reverted"; contractAddress?: Hash | null; transactionHash: Hash }
}

export type VerifiedWalletDeployment = {
  contractAddress: Hash
  deployerAddress: Hash
  encodedConstructorArgs: string
}

export class WalletDeploymentMismatchError extends Error {}

export function verifyWalletDeployment(
  { transaction, receipt }: ChainDeploymentEvidence,
  { artifactBytecode, claimedContractAddress }: { artifactBytecode: Hash; claimedContractAddress?: string }
): VerifiedWalletDeployment {
  if (receipt.status !== "success") {
    throw new WalletDeploymentMismatchError("Deployment transaction reverted")
  }
  if (transaction.to !== null || !receipt.contractAddress) {
    throw new WalletDeploymentMismatchError("Transaction did not create a contract")
  }

  const input = transaction.input.toLowerCase()
  const bytecode = artifactBytecode.toLowerCase()
  if (!input.startsWith(bytecode)) {
    throw new WalletDeploymentMismatchError("Transaction did not deploy the compiled contract")
  }

  if (claimedContractAddress && claimedContractAddress.toLowerCase() !== receipt.contractAddress.toLowerCase()) {
    throw new WalletDeploymentMismatchError("Contract address does not match the transaction receipt")
  }

  return {
    contractAddress: receipt.contractAddress,
    deployerAddress: transaction.from,
    encodedConstructorArgs: input.slice(bytecode.length),
  }
}
