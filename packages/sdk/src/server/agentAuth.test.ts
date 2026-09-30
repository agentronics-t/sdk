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

describe('OAuth2 client-credentials JWTs', () => {
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
})

describe('verified crawlers (forward-confirmed reverse DNS)', () => {
  const GOOGLEBOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
  const dns = (reverse: string[], forward: string[]): DnsResolver => ({
    reverse: vi.fn(async () => reverse),
    lookup: vi.fn(async () => forward),
  })

  it('verifies Googlebot when rDNS and forward DNS agree', async () => {
    const auth = createAgentAuth({ crawlers: { resolver: dns(['crawl-66-249-66-1.googlebot.com'], ['66.249.66.1']) } })
    const r = await auth.authenticate(req({ 'user-agent': GOOGLEBOT, 'x-real-ip': '66.249.66.1' }))
    expect(r).toMatchObject({ status: 'verified', agent: { id: 'crawler:Googlebot', method: 'verified-crawler' } })
  })

  it('rejects a spoofed UA whose IP is not Google', async () => {
    const auth = createAgentAuth({ crawlers: { resolver: dns(['host.attacker.example'], ['203.0.113.9']) } })
    const r = await auth.authenticate(req({ 'user-agent': GOOGLEBOT, 'x-real-ip': '203.0.113.9' }))
    expect(r).toMatchObject({ status: 'unverified', reason: 'crawler:rdns_mismatch', claimedName: 'Googlebot' })
  })

  it('rejects when the PTR name is right but forward DNS does not confirm', async () => {
    const auth = createAgentAuth({ crawlers: { resolver: dns(['fake.googlebot.com'], ['66.249.66.2']) } })
    const r = await auth.authenticate(req({ 'user-agent': GOOGLEBOT, 'x-real-ip': '66.249.66.1' }))
    expect(r).toMatchObject({ status: 'unverified', reason: 'crawler:rdns_mismatch' })
  })

  it('never trusts a client-supplied X-Forwarded-For', async () => {
    const resolver = dns(['crawl-66-249-66-1.googlebot.com'], ['66.249.66.1'])
    const auth = createAgentAuth({ crawlers: { resolver } })
    const r = await auth.authenticate(req({ 'user-agent': GOOGLEBOT, 'x-forwarded-for': '66.249.66.1' }))
    expect(r).toMatchObject({ status: 'unverified', reason: 'crawler:client_ip_unknown' })
    expect(resolver.reverse).not.toHaveBeenCalled()
  })
})

describe('access rules', () => {
  const auth = createAgentAuth()
  const verified = { status: 'verified' as const, agent: { id: 'https://chatgpt.com', name: 'ChatGPT agent', vendor: 'OpenAI', method: 'web-bot-auth' as const } }
  const unverified = { status: 'unverified' as const, reason: 'x', attempted: [] }

  it('allows unverified agents by default (monitor mode) and blocks them on request', () => {
    expect(auth.decide(unverified)).toEqual({ action: 'allow', reason: 'unverified_allowed' })
    expect(auth.decide(unverified, { unverified: 'block' })).toMatchObject({ action: 'block' })
  })
  it('blocklist matches id, name or vendor, case-insensitively', () => {
    expect(auth.decide(verified, { block: ['openai'] })).toEqual({ action: 'block', reason: 'blocklisted' })
    expect(auth.decide(verified, { block: ['ChatGPT agent'] })).toMatchObject({ action: 'block' })
  })
  it('allowlist mode blocks verified agents that are not listed', () => {
    expect(auth.decide(verified, { allow: ['Anthropic'] })).toEqual({ action: 'block', reason: 'not_on_allowlist' })
    expect(auth.decide(verified, { allow: ['https://chatgpt.com'] })).toEqual({ action: 'allow', reason: 'verified' })
  })
  it('never blocks human traffic', () => {
    expect(auth.decide({ status: 'none' }, { unverified: 'block', allow: [] })).toMatchObject({ action: 'allow' })
  })
})

describe('headers', () => {
  it('strips forged x-agentronics-* headers before setting the real result', () => {
    const forged = req({ [AGENT_HEADERS.status]: 'verified', [AGENT_HEADERS.id]: 'key:admin', 'X-Agentronics-Auth-Method': 'api-key' })
    const h = withAgentHeaders(forged, { status: 'none' })
    expect(readAgentHeaders(h)).toEqual({ status: 'none', id: null, name: null, vendor: null, method: null })
  })
})

describe('middleware', () => {
  it('blocks with a 403 and reports the decision', async () => {
    const onResult = vi.fn()
    const handle = createAgentAuthHandler({ rules: { unverified: 'block' }, onResult })
    const out = await handle(req({ 'user-agent': 'evil-scraper-bot' }))
    expect(out.blocked?.status).toBe(403)
    expect(await out.blocked?.json()).toMatchObject({ error: 'agent_not_allowed' })
    await new Promise((r) => setTimeout(r, 0))
    expect(onResult).toHaveBeenCalledOnce()
  })

  it('does not report plain human traffic', async () => {
    const onResult = vi.fn()
    const out = await createAgentAuthHandler({ onResult })(req())
    expect(out.blocked).toBeNull()
    await new Promise((r) => setTimeout(r, 0))
    expect(onResult).not.toHaveBeenCalled()
  })

  it('express adapter sets req.agent and forwards headers, or ends blocked requests', async () => {
    const key = generateAgentKey()
    const verify = staticKeyVerifier({ [await hashAgentKey(key)]: { agentId: 'a1' } })
    const mw = expressAgentAuth({ apiKey: { verify }, rules: { unverified: 'block' } })

    const okReq = { method: 'GET', originalUrl: '/x', protocol: 'https', headers: { host: 'shop.example', authorization: `Bearer ${key}`, [AGENT_HEADERS.id]: 'forged' } } as never as Parameters<typeof mw>[0]
    const next = vi.fn()
    await new Promise<void>((done) => mw(okReq, { statusCode: 200, setHeader() {}, end() {} }, (e?: unknown) => { next(e); done() }))
    expect(next).toHaveBeenCalledWith(undefined)
    expect(okReq.agent).toMatchObject({ status: 'verified' })
    expect(okReq.headers[AGENT_HEADERS.id]).toBe('key:a1')

    const res = { statusCode: 200, headers: {} as Record<string, string>, body: '', setHeader(k: string, v: string) { this.headers[k] = v }, end(b?: string) { this.body = b ?? '' } }
    const badReq = { method: 'GET', originalUrl: '/x', headers: { host: 'shop.example', 'user-agent': 'scraper-bot' } } as never as Parameters<typeof mw>[0]
    await new Promise<void>((done) => {
      const end = res.end.bind(res)
      res.end = (b?: string) => { end(b); done() }
      mw(badReq, res, () => done())
    })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body)).toMatchObject({ error: 'agent_not_allowed' })
  })
})

describe('trace events', () => {
  it('produce events that pass the ingest schema', async () => {
    const auth = createAgentAuth()
    const r = { status: 'verified' as const, agent: { id: 'https://chatgpt.com', name: 'ChatGPT agent', vendor: 'OpenAI', method: 'web-bot-auth' as const } }
    const ev = toTraceEvent(r, auth.decide(r), { siteId: 'shop', request: req() })
    expect(() => TraceEvent.parse(ev)).not.toThrow()
    expect(ev).toMatchObject({ type: 'auth.identity_presented', outcome: 'success', metadata: { protocol: 'web-bot-auth', subject: 'https://chatgpt.com', page: '/products' } })

    const u = { status: 'unverified' as const, reason: 'crawler:rdns_mismatch', claimedName: 'Googlebot', attempted: ['verified-crawler' as const] }
    const ev2 = toTraceEvent(u, { action: 'block', reason: 'unverified:x' }, { siteId: 'shop', request: req() })
    expect(() => TraceEvent.parse(ev2)).not.toThrow()
    expect(ev2).toMatchObject({ outcome: 'blocked', error: 'crawler:rdns_mismatch' })
    expect(toTraceEvent({ status: 'none' }, { action: 'allow', reason: '' }, { siteId: 's', request: req() })).toBeNull()
  })
})
