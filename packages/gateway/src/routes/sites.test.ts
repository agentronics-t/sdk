import { describe, expect, it } from 'vitest'
import { buildFixture } from '../test/fixtures.js'

describe('sites routes', () => {
  it('creates a new site under the calling org', async () => {
    const fixture = await buildFixture()
    const res = await fixture.app.request('/v1/sites', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-clerk-user': fixture.orgA.clerkUserId,
      },
      body: JSON.stringify({ siteId: 'acme-prod', name: 'Acme Prod' }),
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as { site: { id: string; orgId: string; name: string } }
    expect(body.site.id).toBe('acme-prod')
    expect(body.site.orgId).toBe(fixture.orgA.id)
    expect(body.site.name).toBe('Acme Prod')
  })

  it('returns 200 with the existing site if the caller owns it', async () => {
    const fixture = await buildFixture()
    const res = await fixture.app.request('/v1/sites', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-clerk-user': fixture.orgA.clerkUserId },
      body: JSON.stringify({ siteId: fixture.orgA.siteId, name: 're-create' }),
    })
    expect(res.status).toBe(200)
  })

  it('returns 409 when another org owns the siteId', async () => {
    const fixture = await buildFixture()
    const res = await fixture.app.request('/v1/sites', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-clerk-user': fixture.orgB.clerkUserId },
      body: JSON.stringify({ siteId: fixture.orgA.siteId, name: 'steal-attempt' }),
    })
    expect(res.status).toBe(409)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('site_id_taken')
  })

  it('rejects unauthenticated requests', async () => {
    const fixture = await buildFixture()
    const res = await fixture.app.request('/v1/sites', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ siteId: 'x', name: 'y' }),
    })
    expect(res.status).toBe(401)
  })

  it('rejects invalid siteId characters', async () => {
    const fixture = await buildFixture()
    const res = await fixture.app.request('/v1/sites', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-clerk-user': fixture.orgA.clerkUserId },
      body: JSON.stringify({ siteId: 'has spaces!', name: 'bad' }),
    })
    expect(res.status).toBe(400)
  })

  it('lists only the calling orgs sites', async () => {
    const fixture = await buildFixture()
    const res = await fixture.app.request('/v1/sites', {
      headers: { 'x-clerk-user': fixture.orgA.clerkUserId },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { sites: Array<{ id: string; orgId: string }> }
    expect(body.sites.every((s) => s.orgId === fixture.orgA.id)).toBe(true)
    expect(body.sites.some((s) => s.id === fixture.orgA.siteId)).toBe(true)
  })

  it('deletes a site the caller owns and 404s on someone elses site', async () => {
    const fixture = await buildFixture()
    const owner = await fixture.app.request(
      `/v1/sites/${encodeURIComponent(fixture.orgA.siteId)}`,
      { method: 'DELETE', headers: { 'x-clerk-user': fixture.orgA.clerkUserId } }
    )
    expect(owner.status).toBe(200)
    const stranger = await fixture.app.request(
      `/v1/sites/${encodeURIComponent(fixture.orgB.siteId)}`,
      { method: 'DELETE', headers: { 'x-clerk-user': fixture.orgA.clerkUserId } }
    )
    expect(stranger.status).toBe(404)
  })
})
