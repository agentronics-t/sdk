import { describe, expect, it } from 'vitest'
import type { SiteMemory } from '@agentronics/protocol'
import { buildFixture } from '../test/fixtures.js'

describe('memory routes', () => {
  it('returns the empty default with an etag for a fresh site', async () => {
    const fixture = await buildFixture()
    const res = await fixture.app.request(`/v1/sites/${fixture.orgA.siteId}/memory`, {
      headers: { authorization: `Bearer ${fixture.orgA.publishable}` },
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('etag')).toBeTruthy()
    const body = (await res.json()) as { memory: SiteMemory }
    expect(body.memory.workflows).toEqual({})
  })

  it('cross-tenant read returns 403', async () => {
    const fixture = await buildFixture()
    const res = await fixture.app.request(`/v1/sites/${fixture.orgA.siteId}/memory`, {
      headers: { authorization: `Bearer ${fixture.orgB.publishable}` },
    })
    expect(res.status).toBe(403)
  })

  it('PUT memory and read it back via the well-known endpoint', async () => {
    const fixture = await buildFixture()
    const put = await fixture.app.request(`/v1/sites/${fixture.orgA.siteId}/memory`, {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${fixture.orgA.secret}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        memory: {
          policies: { shipping: 'Free over $50' },
          workflows: { purchase: { steps: [{ step: 1, action: 'add' }] } },
        },
      }),
    })
    expect(put.status).toBe(200)
    const wellKnown = await fixture.app.request(
      `/v1/sites/${fixture.orgA.siteId}/.well-known/agent-context.json`
    )
    expect(wellKnown.status).toBe(200)
    const body = (await wellKnown.json()) as SiteMemory
    expect(body.policies.shipping).toBe('Free over $50')
  })

  it('PUT rejects publishable keys with 403', async () => {
    const fixture = await buildFixture()
    const res = await fixture.app.request(`/v1/sites/${fixture.orgA.siteId}/memory`, {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${fixture.orgA.publishable}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ memory: {} }),
    })
    expect(res.status).toBe(403)
  })

  it('GET requires a bearer', async () => {
    const fixture = await buildFixture()
    const res = await fixture.app.request(`/v1/sites/${fixture.orgA.siteId}/memory`)
    expect(res.status).toBe(401)
  })
})
