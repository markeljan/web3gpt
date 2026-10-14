import "server-only"
// Plain server-only module, called only by lib/solidity/deploy.ts after an on-chain
// receipt confirms the deployment. It must not be marked "use server": that can
// turn these writes into public endpoints for forging deployment records.
import { getSession } from "@/lib/auth"
import { storeDeployment, storeVerification } from "@/lib/data/kv"
import type { DeploymentRecord, VerifyContractParams } from "@/lib/types"

export const storeVerificationAction = async (data: VerifyContractParams) => {
  await storeVerification(data)
}

export const storeDeploymentAction = async (data: DeploymentRecord) => {
  const session = await getSession()
  const userId = session?.user?.id || "anon"

  await storeDeployment(data, userId)
}
