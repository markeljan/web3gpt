import { ApiReference, type ApiReferenceConfiguration } from "@scalar/nextjs-api-reference"
import openApiSpec from "@/public/openapi.json" with { type: "json" }

const config: Partial<ApiReferenceConfiguration> = {
  content: openApiSpec,
  hideClientButton: true,
  metaData: {
    description: "Web3GPT skill and agent API reference",
    title: "Web3GPT Skill API",
  },
  theme: "saturn" as const,
}

export const GET = ApiReference(config)
