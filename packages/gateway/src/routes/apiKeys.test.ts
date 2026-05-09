import { describe, expect, it } from 'vitest'
import { buildFixture } from '../test/fixtures.js'

describe('api key routes', () => {
  it('issues a new pk/sk pair under a Clerk session', async () => {
    const fixture = await buildFixture()
    const res = await fixture.app.request('/v1/api-keys', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-clerk-user': fixture.orgA.clerkUserId,
      },
      body: JSON.stringify({ label: 'production' }),
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as {
      publishable: { key: string }
      secret: { key: string }
    }
    expect(body.publishable.key).toMatch(/^agtx_pk_/)
    expect(body.secret.key).toMatch(/^agtx_sk_/)
  })

  it('rejects unauthenticated requests', async () => {
    const fixture = await buildFixture()
    const res = await fixture.app.request('/v1/api-keys', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ label: 'x' }),
    })
    expect(res.status).toBe(401)
  })

  it('revokes a key and refuses to revoke another org\'s key', async () => {
    const fixture = await buildFixture()
    const created = await fixture.app.request('/v1/api-keys', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-clerk-user': fixture.orgA.clerkUserId },
      body: JSON.stringify({ label: 'production' }),
    })
    const body = (await created.json()) as { publishable: { id: string } }
    const newKeyId = body.publishable.id

    const ownerRevoke = await fixture.app.request(`/v1/api-keys/${newKeyId}`, {
      method: 'DELETE',
      headers: { 'x-clerk-user': fixture.orgA.clerkUserId },
    })
    expect(ownerRevoke.status).toBe(200)

    const stranger = await fixture.app.request(`/v1/api-keys/${newKeyId}`, {
      method: 'DELETE',
      headers: { 'x-clerk-user': fixture.orgB.clerkUserId },
    })
    expect(stranger.status).toBe(404)
  })

  it('lists keys for the calling org only', async () => {
    const fixture = await buildFixture()
    const res = await fixture.app.request('/v1/api-keys', {
      headers: { 'x-clerk-user': fixture.orgA.clerkUserId },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { keys: { id: string }[] }
    // fixture seeded one pk + one sk for orgA only
    expect(body.keys).toHaveLength(2)
  })
})
