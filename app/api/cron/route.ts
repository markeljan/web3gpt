import { type NextRequest, NextResponse } from "next/server"
import { processVerifications } from "@/lib/solidity/verification-script"

const { CRON_SECRET } = process.env

export const dynamic = "force-dynamic"

const isAuthorized = (req: NextRequest) => {
  const token = req.headers.get("Authorization")
  return Boolean(CRON_SECRET && token && token.replace("Bearer ", "") === CRON_SECRET)
}

const handleCron = async (req: NextRequest) => {
  if (!CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 })
  }

  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const result = await processVerifications()
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to process verifications",
      },
      { status: 500 }
    )
  }
}

export const GET = handleCron
export const POST = handleCron
