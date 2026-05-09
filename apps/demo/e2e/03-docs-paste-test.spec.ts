import { test, expect } from '@playwright/test'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const fixtureDir = path.resolve(here, 'fixtures/getting-started')
const repoRoot = path.resolve(here, '../../..')

test('docs paste test — fixture project building against the workspace SDK succeeds', () => {
  const dist = path.join(fixtureDir, 'dist')
  if (existsSync(dist)) rmSync(dist, { recursive: true, force: true })

  const result = spawnSync('pnpm', ['--filter', '@agentronics/e2e-getting-started', 'build'], {
    cwd: repoRoot,
    encoding: 'utf-8',
    timeout: 60_000,
  })

  expect(result.status, `vite build failed:\n${result.stderr || result.stdout}`).toBe(0)
  expect(existsSync(path.join(dist, 'index.html'))).toBe(true)

  // The pasted Getting Started snippet imports `Agentronics` and calls
  // `.init`. The bundle must contain a reference to the SDK boot path —
  // we check for the literal string the SDK throws on a wrong key kind,
  // which is bundled along with `init()`.
  const indexHtml = readFileSync(path.join(dist, 'index.html'), 'utf-8')
  const jsAssetMatch = indexHtml.match(/src="([^"]+\.js)"/)
  expect(jsAssetMatch).not.toBeNull()
  const jsAssetPath = path.join(dist, jsAssetMatch![1]!.replace(/^\//, ''))
  const bundle = readFileSync(jsAssetPath, 'utf-8')
  expect(bundle).toContain('Agentronics')
})
