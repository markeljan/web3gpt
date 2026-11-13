import { expect, mock, test } from "bun:test"
import { generatePrivateKey } from "viem/accounts"

const missingKeyPattern = /DEPLOYER_PRIVATE_KEY is not set/u
const compilerError = new Error("compiler sentinel")
const compileContract = mock(() => Promise.reject(compilerError))

mock.module("server-only", () => ({}))
mock.module("@vercel/analytics/server", () => ({ track: mock() }))
mock.module("@/lib/actions/deploy-contract", () => ({ compileContract }))
mock.module("@/lib/actions/verification", () => ({
  storeDeploymentAction: mock(),
  storeVerificationAction: mock(),
}))
mock.module("@/lib/data/ipfs", () => ({ ipfsUploadDir: mock() }))

test("imports without a deployer key and resolves it before compiling at runtime", async () => {
  const originalKey = process.env.DEPLOYER_PRIVATE_KEY
  try {
    delete process.env.DEPLOYER_PRIVATE_KEY
    const modulePromise = import("@/lib/solidity/deploy")
    await expect(modulePromise).resolves.toBeDefined()
    const { deployContract } = await modulePromise
    const params = {
      chainId: 80_002,
      constructorArgs: [],
      contractName: "A",
      sourceCode: "contract A {}",
    }

    await expect(deployContract(params)).rejects.toThrow(missingKeyPattern)
    expect(compileContract).not.toHaveBeenCalled()

    process.env.DEPLOYER_PRIVATE_KEY = ""
    await expect(deployContract(params)).rejects.toThrow(missingKeyPattern)
    expect(compileContract).not.toHaveBeenCalled()

    process.env.DEPLOYER_PRIVATE_KEY = generatePrivateKey().slice(2)
    await expect(deployContract(params)).rejects.toBe(compilerError)
    expect(compileContract).toHaveBeenCalledTimes(1)
  } finally {
    if (originalKey === undefined) {
      delete process.env.DEPLOYER_PRIVATE_KEY
    } else {
      process.env.DEPLOYER_PRIVATE_KEY = originalKey
    }
    mock.restore()
  }
})
