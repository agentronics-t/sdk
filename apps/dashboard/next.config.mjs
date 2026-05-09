import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
// Pin Next's tracing root to the SDK monorepo so the "multiple lockfiles
// detected" warning stops flagging the parent ideas/-folder lockfile.
const tracingRoot = resolve(here, '../..')

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  outputFileTracingRoot: tracingRoot,
}

export default config
