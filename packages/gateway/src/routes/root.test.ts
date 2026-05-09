import { describe, expect, it } from 'vitest'
import { buildFixture } from '../test/fixtures.js'

describe('GET /', () => {
  it('returns themed HTML for browsers', async () => {
    const fixture = await buildFixture()
    const res = await fixture.app.request('/', {
      headers: { accept: 'text/html,application/xhtml+xml' },
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type') ?? '').toContain('text/html')
    const body = await res.text()
    expect(body).toContain('AGENTRONICS · GATEWAY')
    expect(body).toContain('--accent: #6366f1')
    expect(body).toContain('GET /v1/health')
  })

  it('returns the JSON service descriptor for Accept: application/json', async () => {
    const fixture = await buildFixture()
    const res = await fixture.app.request('/', {
      headers: { accept: 'application/json' },
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type') ?? '').toContain('application/json')
    const body = (await res.json()) as {
      service: string
      version: string
      endpoints: string[]
    }
    expect(body.service).toBe('agentronics-gateway')
    expect(body.version).toBe('0.1.0')
    expect(body.endpoints).toContain('/v1/health')
  })
})
