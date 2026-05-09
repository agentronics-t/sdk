import { describe, expect, it } from 'vitest'
import type { PolicyRule } from '@agentronics/protocol'
import { buildFixture } from '../test/fixtures.js'

const SAMPLE_POLICY: PolicyRule = {
  id: 'tool:cart.checkout',
  tool: 'cart.checkout',
  minTrust: 'verified',
  allowedClasses: [],
  decision: 'allow',
}

describe('policy routes', () => {
  it('returns the stored policies for the publishable key', async () => {
    const fixture = await buildFixture()
    await fixture.storage.policies.put(fixture.orgA.siteId, {
      policies: [SAMPLE_POLICY],
      etag: 'W/"seed"',
      updatedAt: new Date().toISOString(),
    })
    const res = await fixture.app.request(`/v1/sites/${fixture.orgA.siteId}/policies`, {
      headers: { authorization: `Bearer ${fixture.orgA.publishable}` },
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('etag')).toBe('W/"seed"')
    const body = (await res.json()) as { policies: PolicyRule[] }
    expect(body.policies).toEqual([SAMPLE_POLICY])
  })

  it('responds 304 when the if-none-match header matches', async () => {
    const fixture = await buildFixture()
    await fixture.storage.policies.put(fixture.orgA.siteId, {
      policies: [SAMPLE_POLICY],
      etag: 'W/"seed"',
      updatedAt: new Date().toISOString(),
    })
    const res = await fixture.app.request(`/v1/sites/${fixture.orgA.siteId}/policies`, {
      headers: {
        authorization: `Bearer ${fixture.orgA.publishable}`,
        'if-none-match': 'W/"seed"',
      },
    })
    expect(res.status).toBe(304)
  })

  it('rejects requests without a bearer with 401', async () => {
    const fixture = await buildFixture()
    const res = await fixture.app.request(`/v1/sites/${fixture.orgA.siteId}/policies`)
    expect(res.status).toBe(401)
  })

  it('returns 403 when org B reads org A site', async () => {
    const fixture = await buildFixture()
    const res = await fixture.app.request(`/v1/sites/${fixture.orgA.siteId}/policies`, {
      headers: { authorization: `Bearer ${fixture.orgB.publishable}` },
    })
    expect(res.status).toBe(403)
  })

  it('PUT requires a secret key', async () => {
    const fixture = await buildFixture()
    const res = await fixture.app.request(`/v1/sites/${fixture.orgA.siteId}/policies`, {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${fixture.orgA.publishable}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ policies: [SAMPLE_POLICY] }),
    })
    expect(res.status).toBe(403)
  })

  it('PUT writes policies and round-trips the etag', async () => {
    const fixture = await buildFixture()
    const put = await fixture.app.request(`/v1/sites/${fixture.orgA.siteId}/policies`, {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${fixture.orgA.secret}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ policies: [SAMPLE_POLICY] }),
    })
    expect(put.status).toBe(200)
    const putBody = (await put.json()) as { ok: boolean; etag: string }
    expect(putBody.ok).toBe(true)
    expect(putBody.etag).toBeTruthy()

    const get = await fixture.app.request(`/v1/sites/${fixture.orgA.siteId}/policies`, {
      headers: { authorization: `Bearer ${fixture.orgA.publishable}` },
    })
    expect(get.headers.get('etag')).toBe(putBody.etag)
  })
})
