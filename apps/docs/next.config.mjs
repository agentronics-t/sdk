import { createMDX } from 'fumadocs-mdx/next'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
// Pin Next's tracing root to the SDK monorepo so the "multiple lockfiles
// detected" warning stops flagging the parent ideas/-folder lockfile.
const tracingRoot = resolve(here, '../..')

const withMDX = createMDX()

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  outputFileTracingRoot: tracingRoot,
  // Multi-zone: the marketing site (landing-page) owns agentronics.dev and
  // proxies /docs and /docs/* here. Prefix our static assets so they don't
  // collide with the parent zone's /_next, and so a single set of parent
  // rewrites (/docs, /docs/:path+, /docs-static/:path+) can route everything.
  // Next 15 serves these assets under /docs-static/_next automatically.
  assetPrefix: '/docs-static',
}

export default withMDX(config)
