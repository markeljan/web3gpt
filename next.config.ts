import type { NextConfig } from "next"

const config: NextConfig = {
  async headers() {
    return [
      {
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self' https://app.safe.global https://*.blockscout.com;",
          },
          {
            key: "Access-Control-Allow-Origin",
            value: "*",
          },
          {
            key: "Access-Control-Allow-Methods",
            value: "GET, POST, OPTIONS",
          },
          {
            key: "Access-Control-Allow-Headers",
            value: "X-Requested-With, content-type, Authorization",
          },
        ],
        source: "/api/:path*",
      },
    ]
  },
  images: {
    remotePatterns: [
      {
        hostname: "**",
        protocol: "https",
      },
    ],
  },
  async rewrites() {
    return [
      {
        destination: "/api/api-docs",
        source: "/api-docs",
      },
      {
        destination: "/api/farcaster",
        source: "/.well-known/farcaster.json",
      },
    ]
  },
  // Migrated from webpack config for Turbopack compatibility
  serverExternalPackages: ["pino-pretty", "lokijs", "encoding"],
  turbopack: {},
  // Keep webpack config for fallback when using --webpack flag
  webpack: (webpackConfig) => {
    webpackConfig.externals.push("pino-pretty", "lokijs", "encoding")
    // ignore metamask sdk react-native-async-storage errors
    webpackConfig.resolve.fallback = {
      ...webpackConfig.resolve.fallback,
      "@react-native-async-storage/async-storage": false,
    }
    return webpackConfig
  },
}

export default config
