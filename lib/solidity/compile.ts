import "server-only"
import type { SolcInput, SolcInputSources, SolcOutput } from "solc"
import type { Abi, Hash } from "viem"
import { getEvmVersion } from "@/lib/solidity/compiler-version"
import { getCompiler, resolveCompilerRelease } from "@/lib/solidity/solc-loader"
import { getContractFileName, prepareContractSources } from "@/lib/solidity/utils"
import { ensureHashPrefix } from "@/lib/utils"

export type CompiledContract = {
  abi: Abi
  bytecode: Hash
  standardJsonInput: string
  sources: SolcInputSources
  /** Full solc version used, e.g. "v0.8.24+commit.e11b9ed9". Explorer verification must use the same one. */
  compilerVersion: string
}

export async function compileContractSource({
  contractName,
  sourceCode,
  sources: additionalSources,
}: {
  contractName: string
  sourceCode: string
  sources?: Record<string, string>
}): Promise<CompiledContract> {
  const sources = await prepareContractSources(contractName, sourceCode, additionalSources)
  const release = await resolveCompilerRelease(sources)
  const solc = await getCompiler(release)
  const evmVersion = getEvmVersion(release)
  const standardJsonInput = JSON.stringify({
    language: "Solidity",
    settings: {
      ...(evmVersion ? { evmVersion } : {}),
      optimizer: {
        enabled: true,
        runs: 200,
      },
      outputSelection: {
        "*": {
          "*": ["*"],
        },
      },
    },
    sources,
  } satisfies SolcInput)

  const fileName = getContractFileName(contractName)
  const compileOutput: SolcOutput = JSON.parse(solc.compile(standardJsonInput))

  if (compileOutput.errors) {
    const errors = compileOutput.errors.filter((error) => error.severity === "error")
    if (errors.length > 0) {
      throw new Error(errors[0].formattedMessage)
    }
  }

  const contract = compileOutput.contracts[fileName]?.[contractName]
  if (!contract) {
    throw new Error(`Compiled contract ${contractName} was not found in ${fileName}`)
  }

  return {
    abi: contract.abi,
    bytecode: ensureHashPrefix(contract.evm.bytecode.object),
    compilerVersion: release.longVersion,
    sources,
    standardJsonInput,
  }
}
