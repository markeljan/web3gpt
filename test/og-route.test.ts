import { beforeEach, describe, expect, mock, test } from "bun:test"

const options: unknown[] = []

mock.module("server-only", () => ({}))
mock.module("@/lib/data/kv", () => ({
  getPublishedChat: () => Promise.resolve(null),
}))
mock.module("next/og", () => ({
  ImageResponse: class extends Response {
    constructor(_element: unknown, imageOptions: unknown) {
      super()
      options.push(imageOptions)
    }
  },
}))

const { GET } = await import("@/app/api/og/route")

const get = (query: string) => {
  const request = new Request(`http://localhost/api/og${query}`)
  Object.assign(request, { nextUrl: new URL(request.url) })
  return GET(request as never)
}

beforeEach(() => {
  options.length = 0
})

describe("/api/og", () => {
  for (const query of ["", "?id="]) {
    test(`rejects missing or empty id: ${query}`, async () => {
      const response = await get(query)
      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({
        code: "missing_id",
        error: "id query parameter is required",
      })
      expect(options).toHaveLength(0)
    })
  }

  for (const height of [200, 630, 675, 1200]) {
    test(`renders height ${height}`, async () => {
      const response = await get(`?id=chat&h=${height}`)
      expect(response.status).toBe(200)
      expect(options).toEqual([{ height, width: 1200 }])
    })
  }

  for (const query of ["&h=99999", "&h=abc", "&h=0", "", "&h=199", "&h=1201", "&h=630.5"]) {
    test(`falls back to 630 for height query: ${query}`, async () => {
      const response = await get(`?id=chat${query}`)
      expect(response.status).toBe(200)
      expect(options).toEqual([{ height: 630, width: 1200 }])
    })
  }
})
