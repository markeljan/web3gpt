import { NextResponse } from "next/server"

// Any /api path without its own route. Agents can't parse the HTML 404 page, so
// answer in the same JSON error shape the API routes use.
const notFound = (request: Request) =>
  NextResponse.json(
    {
      code: "not_found",
      docs: "/api-docs",
      error: `No API route for ${request.method} ${new URL(request.url).pathname}`,
    },
    { status: 404 }
  )

export const GET = notFound
export const POST = notFound
export const PUT = notFound
export const PATCH = notFound
export const DELETE = notFound
