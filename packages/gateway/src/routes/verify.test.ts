import { beforeAll, describe, expect, it } from 'vitest'
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose'
import { createApp } from '../app.js'
import { createInMemoryStorage } from '../storage/memory.js'
import { issueApiKeyPair } from '../auth/apiKeys.js'
import { loadEnv } from '../env.js'
import type { ClerkAuthOptions } from '../middleware/clerkAuth.js'

// The route tests cover the wiring (auth, ownership, dispatch, audit
// emission, config lookup). Crypto-level verification is covered in the
// verifier unit tests. We inject the route flow with valid sso/spiffe
// configs that point at a local JWKS endpoint so we can mint tokens that
// pass real verification end-to-end.

interface Keys {
  privateKey: Awaited<ReturnType<typeof generateKeyPair>>['privateKey']
  publicJwk: ReturnType<typeof JSON.parse>
}

let keys: Keys
let jwksJson: string

beforeAll(async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256')
  const publicJwk = await exportJWK(publicKey)
  keys = { privateKey, publicJwk: { ...publicJwk, kid: 'k1', alg: 'RS256', use: 'sig' } }
  jwksJson = JSON.stringify({ keys: [keys.publicJwk] })
  // Sanity: the LocalJWKSet here is just to confirm minting works without
  // depending on the (cached) remote fetcher path.
  createLocalJWKSet({ keys: [keys.publicJwk] })
})

const buildHarness = async () => {
  const storage = createInMemoryStorage()
  const org = await storage.orgs.create({ name: 'A Inc' })
  await storage.sites.create({ orgId: org.id, siteId: 'site-a', name: 'site-a' })
  const pair = await issueApiKeyPair(storage.apiKeys, { orgId: org.id, label: 'test' })
  const env = loadEnv({
    NODE_ENV: 'test',
    PORT: '8787',
    ALLOWED_ORIGINS: 'http://localhost:3000',
  })
  const resolveSession: ClerkAuthOptions['resolveSession'] = async () => null
  // Fetcher that intercepts the OIDC discovery + JWKS URLs the verifier
  // would otherwise pull from the network.
  const fetcher: typeof fetch = (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url.endsWith('/.well-known/openid-configuration')) {
      return new Response(
        JSON.stringify({ jwks_uri: 'https://idp.test/jwks' }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    }
    if (url === 'https://idp.test/jwks' || url === 'https://spiffe.test/bundle') {
      return new Response(jwksJson, {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    throw new Error(`unexpected fetch: ${url}`)
  }) as typeof fetch
  // Stub global fetch for the duration of this harness — verifiers call
  // fetch() directly (no DI plumbed through the route).
  const realFetch = globalThis.fetch
  globalThis.fetch = fetcher
  const app = createApp({ env, storage, resolveSession })
  return {
    app,
    storage,
    org,
    publishable: pair.publishable.plaintext,
    restoreFetch: () => {
      globalThis.fetch = realFetch
    },
  }
}

const mintJwt = async (claims: {
  iss?: string
  aud: string | string[]
  sub: string
}) => {
  const builder = new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setSubject(claims.sub)
    .setAudience(claims.aud)
    .setIssuedAt()
    .setExpirationTime('1h')
  if (claims.iss) builder.setIssuer(claims.iss)
  return builder.sign(keys.privateKey)
}

describe('POST /v1/verify/:protocol', () => {
  it('rejects unsupported protocol names', async () => {
    const h = await buildHarness()
    try {
      const res = await h.app.request('/v1/verify/garbage', {
        method: 'POST',
        headers: { authorization: `Bearer ${h.publishable}`, 'content-type': 'application/json' },
        body: JSON.stringify({ siteId: 'site-a', token: 'tokentoken' }),
      })
      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: string }
      expect(body.error).toBe('unsupported_protocol')
    } finally {
      h.restoreFetch()
    }
  })

  it('returns 401 without a Bearer header', async () => {
    const h = await buildHarness()
    try {
      const res = await h.app.request('/v1/verify/sso', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ siteId: 'site-a', token: 'tokentoken' }),
      })
      expect(res.status).toBe(401)
    } finally {
      h.restoreFetch()
    }
  })

  it('returns 404 site_not_found when siteId does not exist', async () => {
    const h = await buildHarness()
    try {
      const res = await h.app.request('/v1/verify/sso', {
        method: 'POST',
        headers: { authorization: `Bearer ${h.publishable}`, 'content-type': 'application/json' },
        body: JSON.stringify({ siteId: 'nope', token: 'tokentoken' }),
      })
      expect(res.status).toBe(404)
      const body = (await res.json()) as { error: string }
      expect(body.error).toBe('site_not_found')
    } finally {
      h.restoreFetch()
    }
  })

  it('returns 404 sso_not_configured when no config row exists', async () => {
    const h = await buildHarness()
    try {
      const res = await h.app.request('/v1/verify/sso', {
        method: 'POST',
        headers: { authorization: `Bearer ${h.publishable}`, 'content-type': 'application/json' },
        body: JSON.stringify({ siteId: 'site-a', token: 'tokentoken' }),
      })
      expect(res.status).toBe(404)
      const body = (await res.json()) as { error: string }
      expect(body.error).toBe('sso_not_configured')
    } finally {
      h.restoreFetch()
    }
  })

  it('verifies an OIDC ID token end-to-end and writes an audit row', async () => {
    const h = await buildHarness()
    try {
      await h.storage.siteProtocolConfig.upsert({
        siteId: 'site-a',
        protocol: 'sso',
        config: {
          issuer: 'https://idp.test',
          audiences: ['agentronics:site-a'],
        },
      })
      const token = await mintJwt({
        iss: 'https://idp.test',
        aud: 'agentronics:site-a',
        sub: 'auth0|user-42',
      })
      const res = await h.app.request('/v1/verify/sso', {
        method: 'POST',
        headers: { authorization: `Bearer ${h.publishable}`, 'content-type': 'application/json' },
        body: JSON.stringify({ siteId: 'site-a', token }),
      })
      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        trust: string
        vendor: string
        subject: string
        protocol: string
      }
      expect(body.trust).toBe('verified')
      expect(body.vendor).toBe('idp.test')
      expect(body.subject).toBe('auth0|user-42')
      expect(body.protocol).toBe('sso')
      const auditEntries = await h.storage.audit.list(h.org.id)
      expect(auditEntries.some((entry) => entry.action === 'verify.sso')).toBe(true)
    } finally {
      h.restoreFetch()
    }
  })

  it('verifies a SPIFFE JWT-SVID and relabels as google-agent when trust domain is Google', async () => {
    const h = await buildHarness()
    try {
      await h.storage.siteProtocolConfig.upsert({
        siteId: 'site-a',
        protocol: 'spiffe',
        config: {
          trustDomain: 'prod.acme.example',
          bundleEndpoint: 'https://spiffe.test/bundle',
          audiences: ['agentronics:site-a'],
          googleTrustDomains: ['acme-prod.svc.id.goog'],
        },
      })
      const token = await mintJwt({
        sub: 'spiffe://acme-prod.svc.id.goog/resources/vertex/agent-42',
        aud: 'agentronics:site-a',
      })
      const res = await h.app.request('/v1/verify/google-agent', {
        method: 'POST',
        headers: { authorization: `Bearer ${h.publishable}`, 'content-type': 'application/json' },
        body: JSON.stringify({ siteId: 'site-a', token }),
      })
      expect(res.status).toBe(200)
      const body = (await res.json()) as { vendor: string; protocol: string }
      expect(body.vendor).toBe('google')
      expect(body.protocol).toBe('google-agent')
    } finally {
      h.restoreFetch()
    }
  })

  it('rejects google-agent route when the trust domain is not Google', async () => {
    const h = await buildHarness()
    try {
      await h.storage.siteProtocolConfig.upsert({
        siteId: 'site-a',
        protocol: 'spiffe',
        config: {
          trustDomain: 'prod.acme.example',
          bundleEndpoint: 'https://spiffe.test/bundle',
          audiences: ['agentronics:site-a'],
        },
      })
      const token = await mintJwt({
        sub: 'spiffe://prod.acme.example/payments/web-fe',
        aud: 'agentronics:site-a',
      })
      const res = await h.app.request('/v1/verify/google-agent', {
        method: 'POST',
        headers: { authorization: `Bearer ${h.publishable}`, 'content-type': 'application/json' },
        body: JSON.stringify({ siteId: 'site-a', token }),
      })
      expect(res.status).toBe(403)
      const body = (await res.json()) as { error: string }
      expect(body.error).toBe('not_google_trust_domain')
    } finally {
      h.restoreFetch()
    }
  })
})
