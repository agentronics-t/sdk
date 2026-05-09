import { describe, expect, it } from 'vitest'
import { createApp } from './app.js'
import { loadEnv } from './env.js'

describe('gateway app', () => {
  const env = loadEnv({ NODE_ENV: 'test', PORT: '8787', ALLOWED_ORIGINS: 'http://localhost:3000' })
  const app = createApp({ env })

  it('responds to /v1/health', async () => {
    const res = await app.request('/v1/health')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { status: string; database: string }
    expect(body.status).toBe('ok')
    expect(body.database).toBe('unconfigured')
  })

  it('returns 404 for unknown routes', async () => {
    const res = await app.request('/nope')
    expect(res.status).toBe(404)
  })
})
