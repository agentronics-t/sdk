// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseDictionary, serializeDictionary } from './structuredFields.js'
import { signatureBase } from './httpSignatures.js'
import { __clearDirectoryCache, memoryReplayCache, verifyWebBotAuth } from './webBotAuth.js'
import { assertSafeUrl, safeFetch } from './safeFetch.js'

// ---- fixtures: draft-meunier-webbotauth-httpsig-protocol-02 Appendix E.2.1 ----
// Ed25519 key from RFC 9421 §B.1.4 (public x derived from this private key).
const PRIVATE_PKCS8 = 'MC4CAQAwBQYDK2VwBCIEIJ+DYvh6SEqVTm50DFtMDoQikTmiCqirVv9mWG9qfSnF'
const JWK = { kty: 'OKP', crv: 'Ed25519', x: 'JrQLj5P_89iXES9-vFgrIy29clF9CC_oPPsw3c5D0bs', use: 'sig' }
const KEYID = 'poqkLGiymh_W0uP6PZFw-dvez3QJT5SolqXBCW38r0U'
const SIGNER = 'https://signature-agent.test'
const DIR_URL = `${SIGNER}/.well-known/http-message-signatures-directory`
const E21_INPUT =
  'sig2=("@authority" "signature-agent";key="agent2");created=1735689600;keyid="poqkLGiymh_W0uP6PZFw-dvez3QJT5SolqXBCW38r0U";alg="ed25519";expires=4889289600;nonce="n9p433xm+NJ3ph3upfBIGmsuwHw387YV7Q/F+6BSpGCVjYCqQw6rznNA8PVVLySrAWsv0hQtFioQb6E1YsauiA==";tag="web-bot-auth"'
const E21_SIG = 'sig2=:RdNFx5Bj6au3YgAMQL/RzmUlZE8QZLIaXGRpw985hWnwPfMxT228NMk6ehRS1PSl4e8PhbNZACSanGdhEwYCCg==:'
const E21_AGENT = `agent2="${SIGNER}"`
const CREATED = 1735689600

function directoryFetch(opts: { status?: number; body?: unknown; location?: string } = {}) {
  return vi.fn(async (url: string | URL | Request) => {
    const u = String(url)
    if (u !== DIR_URL) return new Response('not found', { status: 404 })
    return new Response(JSON.stringify(opts.body ?? { keys: [JWK] }), {
      status: opts.status ?? 200,
      headers: {
        'content-type': 'application/http-message-signatures-directory+json',
        ...(opts.location ? { location: opts.location } : {}),
      },
    })
  })
}

const golden = (url = 'https://example.com/') =>
  new Request(url, { headers: { 'signature-agent': E21_AGENT, 'signature-input': E21_INPUT, signature: E21_SIG } })

// the official vector expires in 2124 — relax the 24h validity cap for it only
const goldenOpts = (fetch: typeof globalThis.fetch) => ({
  fetch,
  now: () => CREATED + 5,
  maxValiditySec: 200 * 365 * 86400,
  resolveDns: false,
})

async function privateKey() {
  const der = Uint8Array.from(atob(PRIVATE_PKCS8), (c) => c.charCodeAt(0))
  return crypto.subtle.importKey('pkcs8', der, { name: 'Ed25519' }, false, ['sign'])
}

/** Sign a request ourselves (for cases the official vector doesn't cover). */
async function signed(
  url: string,
  {
    components = '"@authority" "signature-agent";key="a1"',
    agentHeader = `a1="${SIGNER}"`,
    created = CREATED,
    expires = CREATED + 3600,
    extra = '',
    tag = 'web-bot-auth',
    keyid = KEYID,
    method = 'GET',
  } = {}
) {
  const input = `s1=(${components});created=${created};keyid="${keyid}";alg="ed25519";expires=${expires}${extra};tag="${tag}"`
  const base = new Request(url, { method, headers: { 'signature-agent': agentHeader } })
  const parsed = parseDictionary(input).get('s1') as never
  const text = signatureBase(parsed, { request: base, url: new URL(url) })
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, await privateKey(), new TextEncoder().encode(text)))
  const b64 = btoa(String.fromCharCode(...sig))
  return new Request(url, {
    method,
    headers: { 'signature-agent': agentHeader, 'signature-input': input, signature: `s1=:${b64}:` },
  })
}

beforeEach(() => __clearDirectoryCache())

describe('structured fields', () => {
  it('round-trips the official Signature-Input byte-for-byte', () => {
    expect(serializeDictionary(parseDictionary(E21_INPUT))).toBe(E21_INPUT)
  })
  it('rejects malformed dictionaries', () => {
    for (const bad of ['a=1,', 'A=1', 'a=(1 2', 'a="unterminated', 'a=:not base64!:']) {
      expect(() => parseDictionary(bad), bad).toThrow()
    }
  })
})

describe('signature base', () => {
  it('builds RFC 9421 lines for method, path, query and authority', async () => {
    const input = parseDictionary('s=("@method" "@path" "@query" "@authority");created=1').get('s') as never
    const url = 'https://Example.com:443/foo/bar?x=1&y=2'
    const base = signatureBase(input, { request: new Request(url, { method: 'post' }), url: new URL(url) })
    expect(base).toBe(
      [
        '"@method": POST',
        '"@path": /foo/bar',
        '"@query": ?x=1&y=2',
        '"@authority": example.com',
        '"@signature-params": ("@method" "@path" "@query" "@authority");created=1',
      ].join('\n')
    )
  })
})

describe('verifyWebBotAuth — official test vector (draft-02 E.2.1)', () => {
  it('verifies the published signature', async () => {
    const fetch = directoryFetch()
    const r = await verifyWebBotAuth(golden(), goldenOpts(fetch))
    expect(r).toMatchObject({ status: 'verified', agentUrl: SIGNER, keyid: KEYID, label: 'sig2', alg: 'ed25519' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('fails when the request went to a different authority', async () => {
    const r = await verifyWebBotAuth(golden('https://evil.example/'), goldenOpts(directoryFetch()))
    expect(r).toMatchObject({ status: 'invalid', reason: 'bad_signature' })
  })

  it('authority pins the expected host (proxy rewrites / multi-host origins)', async () => {
    // signed for example.com, arriving at the origin under another Host
    const viaProxy = golden('https://internal-lb.example/')
    expect(await verifyWebBotAuth(viaProxy, goldenOpts(directoryFetch()))).toMatchObject({ reason: 'bad_signature' })
    __clearDirectoryCache()
    expect(
      await verifyWebBotAuth(viaProxy, { ...goldenOpts(directoryFetch()), authority: () => 'example.com' })
    ).toMatchObject({ status: 'verified' })
  })

  it('caches the key directory between requests', async () => {
    const fetch = directoryFetch()
    await verifyWebBotAuth(golden(), goldenOpts(fetch))
    await verifyWebBotAuth(golden(), goldenOpts(fetch))
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})

describe('verifyWebBotAuth — signed round trips', () => {
  const opts = (fetch = directoryFetch()) => ({ fetch, now: () => CREATED + 10, resolveDns: false })

  it('accepts the legacy sf-string Signature-Agent form', async () => {
    const req = await signed('https://shop.example/', {
      components: '"@authority" "signature-agent"',
      agentHeader: `"${SIGNER}"`,
    })
    expect(await verifyWebBotAuth(req, opts())).toMatchObject({ status: 'verified', agentUrl: SIGNER })
  })

  it('covers @method/@path/@target-uri too', async () => {
    const req = await signed('https://shop.example/cart?id=9', {
      components: '"@method" "@target-uri" "@path" "signature-agent";key="a1"',
      method: 'POST',
    })
    expect(await verifyWebBotAuth(req, opts())).toMatchObject({ status: 'verified' })
  })

  it('ignores signatures not tagged web-bot-auth', async () => {
    const req = await signed('https://shop.example/', { tag: 'something-else' })
    expect(await verifyWebBotAuth(req, opts())).toEqual({ status: 'absent' })
  })

  it('returns absent when there are no signature headers', async () => {
    expect(await verifyWebBotAuth(new Request('https://shop.example/'), opts())).toEqual({ status: 'absent' })
  })

  it('rejects expired, future-dated and over-long signatures', async () => {
    const expired = await signed('https://shop.example/', { created: CREATED - 7200, expires: CREATED - 3600 })
    expect(await verifyWebBotAuth(expired, opts())).toMatchObject({ reason: 'expired' })
    const future = await signed('https://shop.example/', { created: CREATED + 3600, expires: CREATED + 7200 })
    expect(await verifyWebBotAuth(future, opts())).toMatchObject({ reason: 'created_in_future' })
    const long = await signed('https://shop.example/', { expires: CREATED + 3 * 86400 })
    expect(await verifyWebBotAuth(long, opts())).toMatchObject({ reason: 'validity_window_too_long' })
  })

  it('blocks a replayed nonce, but only after a valid signature', async () => {
    const replayCache = memoryReplayCache()
    const req = () => signed('https://shop.example/', { extra: ';nonce="abc123abc123"' })
    const o = { ...opts(), replayCache }
    expect(await verifyWebBotAuth(await req(), o)).toMatchObject({ status: 'verified' })
    expect(await verifyWebBotAuth(await req(), o)).toMatchObject({ reason: 'replayed_nonce' })
  })

  it('rejects an unknown keyid', async () => {
    const req = await signed('https://shop.example/', { keyid: 'not-a-real-thumbprint' })
    expect(await verifyWebBotAuth(req, opts())).toMatchObject({ reason: 'unknown_keyid' })
  })

  it('requires signature-agent and authority/target-uri to be covered', async () => {
    const noAgent = await signed('https://shop.example/', { components: '"@authority"' })
    expect(await verifyWebBotAuth(noAgent, opts())).toMatchObject({ reason: 'signature_agent_not_covered' })
    const noAuthority = await signed('https://shop.example/', { components: '"@path" "signature-agent";key="a1"' })
    expect(await verifyWebBotAuth(noAuthority, opts())).toMatchObject({ reason: 'authority_or_target_uri_not_covered' })
  })

  it('treats non-200 and redirects as discovery failures, and negative-caches them', async () => {
    const f404 = directoryFetch({ status: 404 })
    const req = await signed('https://shop.example/')
    expect(await verifyWebBotAuth(req, opts(f404))).toMatchObject({ reason: 'discovery_failed' })
    expect(await verifyWebBotAuth(await signed('https://shop.example/'), opts(f404))).toMatchObject({
      reason: 'discovery_failed',
    })
    expect(f404).toHaveBeenCalledTimes(1)

    __clearDirectoryCache()
    const redirect = directoryFetch({ status: 302, location: 'http://169.254.169.254/' })
    expect(await verifyWebBotAuth(await signed('https://shop.example/'), opts(redirect))).toMatchObject({
      reason: 'discovery_failed',
    })
  })

  it('never fetches internal or non-HTTPS signers (SSRF)', async () => {
    for (const agent of ['https://127.0.0.1', 'https://localhost', 'https://metadata.internal', 'http://signature-agent.test']) {
      const fetch = directoryFetch()
      const req = await signed('https://shop.example/', { agentHeader: `a1="${agent}"` })
      const r = await verifyWebBotAuth(req, opts(fetch))
      expect(r.status, agent).toBe('invalid')
      expect(fetch, agent).not.toHaveBeenCalled()
    }
  })

  it('honours allowedDirectories without fetching others', async () => {
    const fetch = directoryFetch()
    const r = await verifyWebBotAuth(await signed('https://shop.example/'), {
      ...opts(fetch),
      allowedDirectories: ['https://chatgpt.com'],
    })
    expect(r).toMatchObject({ reason: 'signer_not_allowed' })
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('safeFetch', () => {
  it('rejects unsafe URLs', () => {
    for (const u of [
      'http://example.com',
      'https://user:pw@example.com',
      'https://example.com:8443',
      'https://10.0.0.1',
      'https://[::1]',
      'https://intranet',
      'https://printer.local',
    ]) {
      expect(() => assertSafeUrl(u), u).toThrow()
    }
    expect(assertSafeUrl('https://chatgpt.com/.well-known/x').hostname).toBe('chatgpt.com')
  })

  it('caps the response size even without content-length', async () => {
    const big = new ReadableStream({
      start(c) {
        c.enqueue(new Uint8Array(70 * 1024))
        c.close()
      },
    })
    const fetch = vi.fn(async () => new Response(big, { status: 200 }))
    await expect(safeFetch('https://example.com/', { fetch, maxBytes: 64 * 1024 })).rejects.toThrow('too large')
  })
})
