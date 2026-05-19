import { beforeAll, describe, expect, it } from 'vitest'
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose'
import { verifySpiffeJwt } from './spiffe.js'
import type { SpiffeConfig } from '../../storage/types.js'

interface TestKeys {
  privateKey: Awaited<ReturnType<typeof generateKeyPair>>['privateKey']
  jwksGetKey: ReturnType<typeof createLocalJWKSet>
}

let keys: TestKeys

beforeAll(async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256')
  const publicJwk = await exportJWK(publicKey)
  // Test JWK omits `use` so jose's LocalJWKSet uses it for JWS verify.
  // Production code normalizes `use: 'jwt-svid'` (per SPIFFE) → `sig`
  // in fetchSpiffeBundle — see spiffe.ts.
  const jwksGetKey = createLocalJWKSet({
    keys: [{ ...publicJwk, kid: 'spiffe-key', alg: 'RS256' }],
  })
  keys = { privateKey, jwksGetKey }
})

const mintSvid = async (claims: { sub: string; aud: string | string[]; extra?: object }) =>
  new SignJWT({ ...(claims.extra ?? {}) })
    .setProtectedHeader({ alg: 'RS256', kid: 'spiffe-key' })
    .setSubject(claims.sub)
    .setAudience(claims.aud)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(keys.privateKey)

const baseConfig: SpiffeConfig = {
  trustDomain: 'prod.acme.example',
  bundleEndpoint: 'https://spiffe.acme.example/bundle',
  audiences: ['agentronics:site-a'],
}

describe('verifySpiffeJwt', () => {
  it('accepts a JWT-SVID with matching trust domain', async () => {
    const token = await mintSvid({
      sub: 'spiffe://prod.acme.example/payments/web-fe',
      aud: 'agentronics:site-a',
    })
    const result = await verifySpiffeJwt(token, baseConfig, { jwks: keys.jwksGetKey })
    expect(result.trust).toBe('verified')
    expect(result.protocol).toBe('spiffe')
    expect(result.vendor).toBe('prod.acme.example')
    expect(result.subject).toBe('spiffe://prod.acme.example/payments/web-fe')
    expect(result.signals?.trustDomain).toBe('prod.acme.example')
  })

  it('rejects when sub is not a SPIFFE URI', async () => {
    const token = await mintSvid({ sub: 'not-a-spiffe-id', aud: 'agentronics:site-a' })
    await expect(
      verifySpiffeJwt(token, baseConfig, { jwks: keys.jwksGetKey })
    ).rejects.toThrow(/spiffe_invalid_sub/)
  })

  it('rejects when trust domain mismatches and no google enrichment is configured', async () => {
    const token = await mintSvid({
      sub: 'spiffe://staging.acme.example/payments/web-fe',
      aud: 'agentronics:site-a',
    })
    await expect(
      verifySpiffeJwt(token, baseConfig, { jwks: keys.jwksGetKey })
    ).rejects.toThrow(/spiffe_trust_domain_mismatch/)
  })

  it('flags google-agent + lifts agent_id when trust domain is in googleTrustDomains', async () => {
    const googleConfig: SpiffeConfig = {
      ...baseConfig,
      googleTrustDomains: ['acme-prod.svc.id.goog'],
    }
    const token = await mintSvid({
      sub: 'spiffe://acme-prod.svc.id.goog/resources/vertex/agent-42',
      aud: 'agentronics:site-a',
      extra: { agent_id: 'agent-42', agent_owner: 'tenant-acme' },
    })
    const result = await verifySpiffeJwt(token, googleConfig, { jwks: keys.jwksGetKey })
    expect(result.vendor).toBe('google')
    expect(result.protocol).toBe('google-agent')
    expect(result.signals?.agent_id).toBe('agent-42')
    expect(result.signals?.agent_owner).toBe('tenant-acme')
  })
})
