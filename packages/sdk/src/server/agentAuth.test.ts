// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SignJWT, exportJWK, generateKeyPair } from 'jose'
import { TraceEvent } from '@agentronics/protocol'
import {
  AGENT_HEADERS,
  createAgentAuth,
  generateAgentKey,
  hashAgentKey,
  readAgentHeaders,
  staticKeyVerifier,
  toTraceEvent,
  withAgentHeaders,
} from './agentAuth.js'
import { __clearRdnsCache, type DnsResolver } from './crawlers.js'
import { createAgentAuthHandler, expressAgentAuth } from './middleware.js'
import { __clearDirectoryCache } from './webBotAuth.js'

const HUMAN_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15'
const req = (headers: Record<string, string> = {}, url = 'https://shop.example/products') =>
  new Request(url, { headers: { 'user-agent': HUMAN_UA, ...headers } })

beforeEach(() => {
  __clearDirectoryCache()
  __clearRdnsCache()
})

describe('plain traffic', () => {
  it('is not agent traffic', async () => {
    const auth = createAgentAuth()
    expect(await auth.authenticate(req())).toEqual({ status: 'none' })
  })
  it('a generic bot UA with no credentials is an unverified agent', async () => {
    const r = await createAgentAuth().authenticate(req({ 'user-agent': 'my-scraper-bot/1.0' }))
    expect(r).toMatchObject({ status: 'unverified', reason: 'agent_claim_without_credentials' })
  })
})

describe('agent API keys', () => {
  it('verifies a known key and rejects an unknown one', async () => {
    const key = generateAgentKey()
    expect(key).toMatch(/^agk_[A-Za-z0-9_-]{43}$/)
    const verify = staticKeyVerifier({ [await hashAgentKey(key)]: { agentId: 'booking-agent', name: 'Booking agent', vendor: 'Acme' } })
    const auth = createAgentAuth({ apiKey: { verify } })

    expect(await auth.authenticate(req({ authorization: `Bearer ${key}` }))).toMatchObject({
      status: 'verified',
      agent: { id: 'key:booking-agent', name: 'Booking agent', vendor: 'Acme', method: 'api-key' },
    })
    expect(await auth.authenticate(req({ 'x-agent-key': key }))).toMatchObject({ status: 'verified' })

    const bad = await auth.authenticate(req({ authorization: `Bearer ${generateAgentKey()}` }))
    expect(bad).toMatchObject({ status: 'unverified', reason: 'api-key:unknown_or_revoked', attempted: ['api-key'] })
  })

  it('does not treat an ordinary bearer token as an agent key', async () => {
    const auth = createAgentAuth({ apiKey: { verify: () => null } })
    expect(await auth.authenticate(req({ authorization: 'Bearer user-session-token' }))).toEqual({ status: 'none' })
  })
})

describe('OAuth 2.1 access tokens', () => {
  const ISS = 'https://auth.acme.example'
  async function setup() {
    const { publicKey, privateKey } = await generateKeyPair('RS256')
    const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' }
    const token = (claims: Record<string, unknown>, aud = 'https://shop.example') =>
      new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setIssuer(ISS).setAudience(aud).setIssuedAt().setExpirationTime('5m').sign(privateKey)
    const auth = createAgentAuth({
      oauth2: { issuer: ISS, audience: 'https://shop.example', jwks: { keys: [jwk] }, requiredScopes: ['agent:browse'] },
    })
    return { auth, token }
  }

  it('verifies a valid token with the required scope', async () => {
    const { auth, token } = await setup()
    const t = await token({ client_id: 'research-agent', scope: 'agent:browse agent:buy' })
    expect(await auth.authenticate(req({ authorization: `Bearer ${t}` }))).toMatchObject({
      status: 'verified',
      agent: { id: 'oauth2:research-agent', method: 'oauth2' },
    })
  })

  it('rejects wrong audience and missing scope', async () => {
    const { auth, token } = await setup()
    const wrongAud = await token({ client_id: 'x', scope: 'agent:browse' }, 'https://other.example')
    expect(await auth.authenticate(req({ authorization: `Bearer ${wrongAud}` }))).toMatchObject({ status: 'unverified' })
    const noScope = await token({ client_id: 'x', scope: 'read' })
    expect(await auth.authenticate(req({ authorization: `Bearer ${noScope}` }))).toMatchObject({
      status: 'unverified',
      reason: 'oauth2:missing_scopes:agent:browse',
    })
  })

  it("ignores JWTs from another issuer (a user's session token is not agent traffic)", async () => {
    const { auth } = await setup()
    const { privateKey } = await generateKeyPair('RS256')
    const userJwt = await new SignJWT({ sub: 'user_1' }).setProtectedHeader({ alg: 'RS256' }).setIssuer('https://clerk.shop.example').sign(privateKey)
    expect(await auth.authenticate(req({ authorization: `Bearer ${userJwt}` }))).toEqual({ status: 'none' })
  })

  it('a delegated token names the user the agent acts for, and traces as linked', async () => {
    const { auth, token } = await setup()
    const t = await token({ client_id: 'shopping-agent', sub: 'user_42', email: 'sam@example.com', scope: 'agent:browse' })
    const r = await auth.authenticate(req({ authorization: `Bearer ${t}` }))
    expect(r).toMatchObject({ status: 'verified', agent: { id: 'oauth2:shopping-agent', onBehalfOf: { sub: 'user_42', email: 'sam@example.com' } } })
    expect(toTraceEvent(r, { siteId: 's', request: req() })?.agent?.trust).toBe('linked')
  })

  it('token exchange: the act claim is the agent, sub is the user', async () => {
    const { auth, token } = await setup()
    const t = await token({ sub: 'user_7', act: { sub: 'agent-runtime-9' }, scope: 'agent:browse' })
    expect(await auth.authenticate(req({ authorization: `Bearer ${t}` }))).toMatchObject({
      status: 'verified',
      agent: { id: 'oauth2:agent-runtime-9', onBehalfOf: { sub: 'user_7' } },
    })
  })

  it('accepts several issuers', async () => {
    const a = await setup()
    const { publicKey, privateKey } = await generateKeyPair('ES256')
    const jwk = { ...(await exportJWK(publicKey)), kid: 'p1', alg: 'ES256' }
    const partner = 'https://idp.partner.example'
    const auth = createAgentAuth({
      oauth2: [
        { issuer: ISS, audience: 'https://shop.example', jwks: { keys: [] } },
        { issuer: partner, audience: 'https://shop.example', jwks: { keys: [jwk] } },
      ],
    })
    void a
    const t = await new SignJWT({ client_id: 'partner-agent' }).setProtectedHeader({ alg: 'ES256', kid: 'p1' }).setIssuer(partner).setAudience('https://shop.example').setExpirationTime('5m').sign(privateKey)
    expect(await auth.authenticate(req({ authorization: `Bearer ${t}` }))).toMatchObject({ status: 'verified', agent: { id: 'oauth2:partner-agent' } })
  })
})

describe('DPoP-bound tokens (RFC 9449)', () => {
  const ISS = 'https://auth.acme.example'
  const URL_ = 'https://shop.example/api/orders'
  async function setup() {
    const as = await generateKeyPair('RS256')
    const jwk = { ...(await exportJWK(as.publicKey)), kid: 'k1', alg: 'RS256' }
    const agentKey = await generateKeyPair('ES256')
    const agentJwk = await exportJWK(agentKey.publicKey)
    const { calculateJwkThumbprint } = await import('jose')
    const jkt = await calculateJwkThumbprint(agentJwk, 'sha256')
    const accessToken = await new SignJWT({ client_id: 'bound-agent', cnf: { jkt } })
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setIssuer(ISS).setAudience('https://shop.example').setExpirationTime('5m').sign(as.privateKey)
    const ath = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(accessToken))).toString('base64url')
    const proof = (claims: Record<string, unknown> = {}) =>
      new SignJWT({ htm: 'POST', htu: URL_, ath, jti: crypto.randomUUID(), ...claims })
        .setProtectedHeader({ alg: 'ES256', typ: 'dpop+jwt', jwk: agentJwk }).setIssuedAt().sign(agentKey.privateKey)
    const auth = createAgentAuth({ oauth2: { issuer: ISS, audience: 'https://shop.example', jwks: { keys: [jwk] } } })
    const post = (headers: Record<string, string>) => new Request(URL_, { method: 'POST', headers: { 'user-agent': HUMAN_UA, ...headers } })
    return { auth, accessToken, proof, post }
  }

  it('verifies a bound token with a valid proof', async () => {
    const { auth, accessToken, proof, post } = await setup()
    const r = await auth.authenticate(post({ authorization: `DPoP ${accessToken}`, dpop: await proof() }))
    expect(r).toMatchObject({ status: 'verified', agent: { id: 'oauth2:bound-agent', claims: { dpop: true } } })
  })

  it('refuses a bound token sent as a plain bearer token, a replayed proof, and a proof for another URL', async () => {
    const { auth, accessToken, proof, post } = await setup()
    expect(await auth.authenticate(post({ authorization: `Bearer ${accessToken}` }))).toMatchObject({ reason: 'oauth2:dpop_proof_required' })
    const p = await proof()
    await auth.authenticate(post({ authorization: `DPoP ${accessToken}`, dpop: p }))
    expect(await auth.authenticate(post({ authorization: `DPoP ${accessToken}`, dpop: p }))).toMatchObject({ reason: 'oauth2:dpop_replayed' })
    const other = await proof({ htu: 'https://shop.example/api/admin' })
    expect(await auth.authenticate(post({ authorization: `DPoP ${accessToken}`, dpop: other }))).toMatchObject({ reason: 'oauth2:dpop_htu_mismatch' })
  })
})

describe('protected-resource metadata (RFC 9728)', () => {
  it('describes the resource and builds the WWW-Authenticate challenge', async () => {
    const { protectedResourceMetadata, oauthChallenge } = await import('./oauth.js')
    expect(protectedResourceMetadata({ resource: 'https://shop.example', authorizationServers: ['https://auth.acme.example'], scopesSupported: ['agent:browse'] })).toMatchObject({
      resource: 'https://shop.example',
      authorization_servers: ['https://auth.acme.example'],
      scopes_supported: ['agent:browse'],
    })
    expect(oauthChallenge('https://shop.example/', { scope: 'agent:buy' })).toBe(
      'Bearer resource_metadata="https://shop.example/.well-known/oauth-protected-resource", scope="agent:buy"'
    )
  })
})

const NO_RANGES = { Googlebot: [] as string[] }

describe('verified crawlers (forward-confirmed reverse DNS)', () => {
  const GOOGLEBOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
  const dns = (reverse: string[], forward: string[]): DnsResolver => ({
    reverse: vi.fn(async () => reverse),
    lookup: vi.fn(async () => forward),
  })

  it('verifies Googlebot when rDNS and forward DNS agree', async () => {
    const auth = createAgentAuth({ crawlers: { ipRanges: NO_RANGES, resolver: dns(['crawl-66-249-66-1.googlebot.com'], ['66.249.66.1']) } })
    const r = await auth.authenticate(req({ 'user-agent': GOOGLEBOT, 'x-real-ip': '66.249.66.1' }))
    expect(r).toMatchObject({ status: 'verified', agent: { id: 'crawler:Googlebot', method: 'verified-crawler' } })
  })

  it('rejects a spoofed UA whose IP is not Google', async () => {
    const auth = createAgentAuth({ crawlers: { ipRanges: NO_RANGES, resolver: dns(['host.attacker.example'], ['203.0.113.9']) } })
    const r = await auth.authenticate(req({ 'user-agent': GOOGLEBOT, 'x-real-ip': '203.0.113.9' }))
    expect(r).toMatchObject({ status: 'unverified', reason: 'crawler:rdns_mismatch', claimedName: 'Googlebot' })
  })

  it('rejects when the PTR name is right but forward DNS does not confirm', async () => {
    const auth = createAgentAuth({ crawlers: { ipRanges: NO_RANGES, resolver: dns(['fake.googlebot.com'], ['66.249.66.2']) } })
    const r = await auth.authenticate(req({ 'user-agent': GOOGLEBOT, 'x-real-ip': '66.249.66.1' }))
    expect(r).toMatchObject({ status: 'unverified', reason: 'crawler:rdns_mismatch' })
  })

  it('never trusts a client-supplied X-Forwarded-For', async () => {
    const resolver = dns(['crawl-66-249-66-1.googlebot.com'], ['66.249.66.1'])
    const auth = createAgentAuth({ crawlers: { ipRanges: NO_RANGES, resolver } })
    const r = await auth.authenticate(req({ 'user-agent': GOOGLEBOT, 'x-forwarded-for': '66.249.66.1' }))
    expect(r).toMatchObject({ status: 'unverified', reason: 'crawler:client_ip_unknown' })
    expect(resolver.reverse).not.toHaveBeenCalled()
  })
})

describe('verified crawlers (published IP ranges)', () => {
  const GPTBOT = 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.3; +https://openai.com/gptbot'
  const ranges = { GPTBot: ['132.196.86.0/24', '2a01:111:f400::/48'] }

  it('verifies GPTBot from inside its published ranges, IPv4 and IPv6 — no DNS needed', async () => {
    const auth = createAgentAuth({ crawlers: { ipRanges: ranges } })
    const v4 = await auth.authenticate(req({ 'user-agent': GPTBOT, 'cf-connecting-ip': '132.196.86.42' }))
    expect(v4).toMatchObject({ status: 'verified', agent: { id: 'crawler:GPTBot', claims: { via: 'ip-range' } } })
    const v6 = await auth.authenticate(req({ 'user-agent': GPTBOT, 'cf-connecting-ip': '2a01:111:f400:1::5' }))
    expect(v6).toMatchObject({ status: 'verified' })
  })

  it('rejects a GPTBot claim from outside the ranges', async () => {
    const auth = createAgentAuth({ crawlers: { ipRanges: ranges } })
    const r = await auth.authenticate(req({ 'user-agent': GPTBOT, 'cf-connecting-ip': '203.0.113.9' }))
    expect(r).toMatchObject({ status: 'unverified', reason: 'crawler:ip_outside_published_ranges', claimedName: 'GPTBot' })
  })

  it('loads and caches a vendor range list', async () => {
    const { __clearIpRangeCache, rangesFor } = await import('./ipRanges.js')
    __clearIpRangeCache()
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ prefixes: [{ ipv4Prefix: '1.2.3.0/24' }, { ipv6Prefix: '2001:db8::/32' }] })))
    expect(await rangesFor('PerplexityBot', { fetcher: fetcher as unknown as typeof fetch })).toEqual(['1.2.3.0/24', '2001:db8::/32'])
    await rangesFor('PerplexityBot', { fetcher: fetcher as unknown as typeof fetch })
    expect(fetcher).toHaveBeenCalledOnce()
    expect(await rangesFor('NoSuchBot')).toBeNull()
  })

  it('matches CIDRs exactly', async () => {
    const { ipInCidr } = await import('./ipRanges.js')
    expect(ipInCidr('10.0.0.255', '10.0.0.0/24')).toBe(true)
    expect(ipInCidr('10.0.1.0', '10.0.0.0/24')).toBe(false)
    expect(ipInCidr('::ffff:10.0.0.7', '10.0.0.0/24')).toBe(true)
    expect(ipInCidr('2001:db8::1', '10.0.0.0/8')).toBe(false)
    expect(ipInCidr('2001:4860:4801:10::1', '2001:4860:4801:10::/64')).toBe(true)
    expect(ipInCidr('2001:4860:4801:11::1', '2001:4860:4801:10::/64')).toBe(false)
    expect(ipInCidr('not-an-ip', '10.0.0.0/8')).toBe(false)
  })
})

describe('headers', () => {
  it('strips forged x-agentronics-* headers before setting the real result', () => {
    const forged = req({ [AGENT_HEADERS.status]: 'verified', [AGENT_HEADERS.id]: 'key:admin', 'X-Agentronics-Auth-Method': 'api-key' })
    const h = withAgentHeaders(forged, { status: 'none' })
    expect(readAgentHeaders(h)).toEqual({ status: 'none', id: null, name: null, vendor: null, method: null })
  })
})

describe('middleware never blocks', () => {
  it('passes every request through and reports agent traffic', async () => {
    const onResult = vi.fn()
    const handle = createAgentAuthHandler({ onResult })
    const out = await handle(req({ 'user-agent': 'evil-scraper-bot' }))
    expect(out).not.toHaveProperty('blocked')
    expect(out.result).toMatchObject({ status: 'unverified' })
    expect(readAgentHeaders(out.headers).status).toBe('unverified')
    await new Promise((r) => setTimeout(r, 0))
    expect(onResult).toHaveBeenCalledOnce()
  })

  it('does not report plain human traffic', async () => {
    const onResult = vi.fn()
    await createAgentAuthHandler({ onResult })(req())
    await new Promise((r) => setTimeout(r, 0))
    expect(onResult).not.toHaveBeenCalled()
  })

  it('a throwing onResult never affects the request', async () => {
    const handle = createAgentAuthHandler({ onResult: () => { throw new Error('boom') } })
    await expect(handle(req({ 'user-agent': 'my-bot' }))).resolves.toMatchObject({ result: { status: 'unverified' } })
  })

  it('express adapter always calls next() — verified, unverified, and on internal errors', async () => {
    const key = generateAgentKey()
    const verify = staticKeyVerifier({ [await hashAgentKey(key)]: { agentId: 'a1' } })
    const run = async (mw: ReturnType<typeof expressAgentAuth>, headers: Record<string, string>) => {
      const r = { method: 'GET', originalUrl: '/x', protocol: 'https', headers: { host: 'shop.example', ...headers } } as never as Parameters<typeof mw>[0]
      const next = vi.fn()
      await new Promise<void>((done) => mw(r, {}, (e?: unknown) => { next(e); done() }))
      return { r, next }
    }
    const mw = expressAgentAuth({ apiKey: { verify } })

    const ok = await run(mw, { authorization: `Bearer ${key}`, [AGENT_HEADERS.id]: 'forged' })
    expect(ok.next).toHaveBeenCalledWith(undefined)
    expect(ok.r.agent).toMatchObject({ status: 'verified' })
    expect(ok.r.headers[AGENT_HEADERS.id]).toBe('key:a1')

    const scraper = await run(mw, { 'user-agent': 'scraper-bot' })
    expect(scraper.next).toHaveBeenCalledWith(undefined)
    expect(scraper.r.agent).toMatchObject({ status: 'unverified' })

    const broken = expressAgentAuth({ apiKey: { verify: () => { throw new Error('db down') } } })
    const failed = await run(broken, { authorization: `Bearer ${key}`, [AGENT_HEADERS.id]: 'forged' })
    expect(failed.next).toHaveBeenCalledWith(undefined)
    expect(failed.r.agent).toEqual({ status: 'none' })
    expect(failed.r.headers[AGENT_HEADERS.id]).toBeUndefined()
  })
})

describe('trace events', () => {
  it('produce events that pass the ingest schema', async () => {
    const r = { status: 'verified' as const, agent: { id: 'https://chatgpt.com', name: 'ChatGPT agent', vendor: 'OpenAI', method: 'web-bot-auth' as const } }
    const ev = toTraceEvent(r, { siteId: 'shop', request: req() })
    expect(() => TraceEvent.parse(ev)).not.toThrow()
    expect(ev).toMatchObject({ type: 'auth.identity_presented', outcome: 'success', metadata: { protocol: 'web-bot-auth', subject: 'https://chatgpt.com', page: '/products' } })

    const u = { status: 'unverified' as const, reason: 'crawler:rdns_mismatch', claimedName: 'Googlebot', attempted: ['verified-crawler' as const] }
    const ev2 = toTraceEvent(u, { siteId: 'shop', request: req() })
    expect(() => TraceEvent.parse(ev2)).not.toThrow()
    expect(ev2).toMatchObject({ outcome: 'error', error: 'crawler:rdns_mismatch' })
    expect(toTraceEvent({ status: 'none' }, { siteId: 's', request: req() })).toBeNull()
  })
})
