import { createMDX } from 'fumadocs-mdx/next'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
// Pin Next's tracing root to the SDK monorepo so the "multiple lockfiles
// detected" warning stops flagging the parent ideas/-folder lockfile.
const tracingRoot = resolve(here, '../..')

const withMDX = createMDX()

const SECURITY_HEADERS = [
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
]

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }]
  },
  outputFileTracingRoot: tracingRoot,
  // Multi-zone: the marketing site (landing-page) owns agentronics.dev and
  // proxies /docs and /docs/* here. Prefix our static assets so they don't
  // collide with the parent zone's /_next, and so a single set of parent
  // rewrites (/docs, /docs/:path+, /docs-static/:path+) can route everything.
  // Next 15 serves these assets under /docs-static/_next automatically.
  assetPrefix: '/docs-static',
}

export default withMDX(config)
