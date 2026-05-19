import { describe, expect, it } from 'vitest'
import { buildFixture } from '../test/fixtures.js'

const ssoBody = {
  issuer: 'https://acme.okta.com',
  audiences: ['agentronics:site-a'],
}

const spiffeBody = {
  trustDomain: 'prod.acme.example',
  bundleEndpoint: 'https://spire.acme.example/bundle',
  audiences: ['agentronics:site-a'],
  googleTrustDomains: ['acme-prod.svc.id.goog'],
}

const mtlsBody = {
  rootCerts: [
    '-----BEGIN CERTIFICATE-----\nMIIDxxxxxxxxxxxxxxxxxxxxxxxxxxxx\n-----END CERTIFICATE-----',
  ],
  xfccEntryPolicy: 'last' as const,
}

const put = async (
  fixture: Awaited<ReturnType<typeof buildFixture>>,
  protocol: string,
  body: unknown,
  clerkUserId?: string
) =>
  fixture.app.request(
    `/v1/sites/${encodeURIComponent(fixture.orgA.siteId)}/protocol-config/${protocol}`,
    {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        ...(clerkUserId ? { 'x-clerk-user': clerkUserId } : {}),
      },
      body: JSON.stringify(body),
    }
  )

describe('site protocol-config routes', () => {
  it('upserts SSO config and reads it back via GET', async () => {
    const fixture = await buildFixture()
    const upsert = await put(fixture, 'sso', ssoBody, fixture.orgA.clerkUserId)
    expect(upsert.status).toBe(200)
    const list = await fixture.app.request(
      `/v1/sites/${encodeURIComponent(fixture.orgA.siteId)}/protocol-config`,
      { headers: { 'x-clerk-user': fixture.orgA.clerkUserId } }
    )
    expect(list.status).toBe(200)
    const body = (await list.json()) as { configs: Array<{ protocol: string; config: unknown }> }
    expect(body.configs).toHaveLength(1)
    expect(body.configs[0]?.protocol).toBe('sso')
    expect(body.configs[0]?.config).toEqual(ssoBody)
  })

  it('upserts SPIFFE config (with googleTrustDomains) and mTLS config independently', async () => {
    const fixture = await buildFixture()
    expect((await put(fixture, 'spiffe', spiffeBody, fixture.orgA.clerkUserId)).status).toBe(200)
    expect((await put(fixture, 'mtls', mtlsBody, fixture.orgA.clerkUserId)).status).toBe(200)
    const list = await fixture.app.request(
      `/v1/sites/${encodeURIComponent(fixture.orgA.siteId)}/protocol-config`,
      { headers: { 'x-clerk-user': fixture.orgA.clerkUserId } }
    )
    const body = (await list.json()) as { configs: Array<{ protocol: string }> }
    expect(body.configs.map((c) => c.protocol).sort()).toEqual(['mtls', 'spiffe'])
  })

  it('rejects unsupported protocol names with 400', async () => {
    const fixture = await buildFixture()
    const res = await put(fixture, 'oauth2', {}, fixture.orgA.clerkUserId)
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('unsupported_protocol')
  })

  it('rejects bodies that fail per-protocol validation', async () => {
    const fixture = await buildFixture()
    const res = await put(fixture, 'sso', { issuer: 'not-a-url' }, fixture.orgA.clerkUserId)
    expect(res.status).toBe(400)
  })

  it('rejects unauthenticated requests', async () => {
    const fixture = await buildFixture()
    const res = await put(fixture, 'sso', ssoBody)
    expect(res.status).toBe(401)
  })

  it('404s when the caller does not own the site', async () => {
    const fixture = await buildFixture()
    const res = await put(fixture, 'sso', ssoBody, fixture.orgB.clerkUserId)
    expect(res.status).toBe(404)
  })

  it('deletes a per-protocol config', async () => {
    const fixture = await buildFixture()
    await put(fixture, 'sso', ssoBody, fixture.orgA.clerkUserId)
    const del = await fixture.app.request(
      `/v1/sites/${encodeURIComponent(fixture.orgA.siteId)}/protocol-config/sso`,
      { method: 'DELETE', headers: { 'x-clerk-user': fixture.orgA.clerkUserId } }
    )
    expect(del.status).toBe(200)
    const list = await fixture.app.request(
      `/v1/sites/${encodeURIComponent(fixture.orgA.siteId)}/protocol-config`,
      { headers: { 'x-clerk-user': fixture.orgA.clerkUserId } }
    )
    const body = (await list.json()) as { configs: unknown[] }
    expect(body.configs).toHaveLength(0)
  })
})
