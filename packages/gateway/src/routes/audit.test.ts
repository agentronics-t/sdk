import { describe, expect, it } from 'vitest'
import { buildFixture } from '../test/fixtures.js'

describe('POST /v1/audit/export', () => {
  it('returns the calling org\'s audit log as JSON by default', async () => {
    const fixture = await buildFixture()
    // Trigger an audit row by writing policies with the secret key.
    await fixture.app.request(`/v1/sites/${fixture.orgA.siteId}/policies`, {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${fixture.orgA.secret}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ policies: [] }),
    })

    const res = await fixture.app.request('/v1/audit/export', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${fixture.orgA.secret}`,
        'content-type': 'application/json',
      },
      body: '{}',
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { entries: Array<{ action: string; orgId: string }> }
    expect(body.entries.length).toBeGreaterThan(0)
    expect(body.entries.every((entry) => entry.orgId === fixture.orgA.id)).toBe(true)
  })

  it('renders CSV when format=csv', async () => {
    const fixture = await buildFixture()
    await fixture.app.request(`/v1/sites/${fixture.orgA.siteId}/policies`, {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${fixture.orgA.secret}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ policies: [] }),
    })
    const res = await fixture.app.request('/v1/audit/export', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${fixture.orgA.secret}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ format: 'csv' }),
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/csv')
    const text = await res.text()
    expect(text.split('\n')[0]).toBe('id,orgId,actor,action,target,metadata,occurredAt')
  })

  it('rejects unauthenticated callers with 401', async () => {
    const fixture = await buildFixture()
    const res = await fixture.app.request('/v1/audit/export', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
    expect(res.status).toBe(401)
  })
})
