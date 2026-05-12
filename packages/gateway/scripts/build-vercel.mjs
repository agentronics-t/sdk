// Pre-bundles the Vercel handler with esbuild and writes a Vercel Build
// Output API tree at .vercel/output/. This bypasses Vercel's framework
// auto-detection (which silently dropped our api/ routes when the project
// is monorepo + framework=null) by giving Vercel a fully-formed deployment
// it just has to upload.

import { build } from 'esbuild'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const outDir = resolve(root, '.vercel/output')
const fnDir = resolve(outDir, 'functions/_gateway.func')

await rm(outDir, { recursive: true, force: true })
await mkdir(fnDir, { recursive: true })

await build({
  entryPoints: [resolve(root, 'src/vercel-handler.js')],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  outfile: resolve(fnDir, 'index.mjs'),
  external: [],
  banner: { js: '// gateway bundled for Vercel by scripts/build-vercel.mjs' },
  logLevel: 'info',
})

await writeFile(
  resolve(fnDir, '.vc-config.json'),
  JSON.stringify(
    {
      runtime: 'nodejs22.x',
      handler: 'index.mjs',
      launcherType: 'Nodejs',
      shouldAddHelpers: true,
    },
    null,
    2,
  ),
)

await writeFile(
  resolve(outDir, 'config.json'),
  JSON.stringify(
    {
      version: 3,
      routes: [{ src: '/(.*)', dest: '/_gateway' }],
    },
    null,
    2,
  ),
)

console.log('[build-vercel] wrote', outDir)
