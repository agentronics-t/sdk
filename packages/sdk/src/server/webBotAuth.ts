/**
 * Web Bot Auth verifier — draft-meunier-webbotauth-httpsig-protocol-02.
 *
 * A signed agent request carries:
 *   Signature-Agent: agent2="https://signer.example"        (dictionary form)
 *   Signature-Input: sig2=("@authority" "signature-agent";key="agent2");
 *                    created=…;expires=…;keyid="<JWK thumbprint>";tag="web-bot-auth"
 *   Signature:       sig2=:<base64>:
 * The verifier resolves the signer's key directory
 * (<origin>/.well-known/http-message-signatures-directory by default), picks
 * the key whose JWK thumbprint equals `keyid`, rebuilds the RFC 9421 signature
 * base, and verifies it. Cheap checks run before any network call.
 */
import {
  SignatureError,
  jwkThumbprint,
  resolveAlgorithm,
  signatureBase,
  verifySignature,
  type PublicJwk,
  type SignatureAlgorithm,
} from './httpSignatures.js'
import { safeFetch } from './safeFetch.js'
import {
  type InnerList,
  type Item,
  getParam,
  isInnerList,
  parseDictionary,
  parseItem,
  SfToken,
} from './structuredFields.js'

export const WEB_BOT_AUTH_TAG = 'web-bot-auth'
export const DIRECTORY_PATH = '/.well-known/http-message-signatures-directory'
export const DIRECTORY_MEDIA_TYPE = 'application/http-message-signatures-directory+json'

export interface ReplayCache {
  has(key: string): boolean | Promise<boolean>
  add(key: string, ttlSeconds: number): void | Promise<void>
}

/** Bounded in-memory replay cache. Use a shared store (Redis…) across instances. */
export function memoryReplayCache(maxEntries = 10_000): ReplayCache {
  const m = new Map<string, number>()
  return {
    has(key) {
      const exp = m.get(key)
      if (exp === undefined) return false
      if (exp < Date.now()) {
        m.delete(key)
        return false
      }
      return true
    },
    add(key, ttl) {
      if (m.size >= maxEntries) m.delete(m.keys().next().value as string)
      m.set(key, Date.now() + ttl * 1000)
    },
  }
}

export interface WebBotAuthOptions {
  /**
   * Which signers may be resolved. `'any'` (default) accepts any public HTTPS
   * signer behind SSRF guards; a list restricts to those origins/URLs.
   */
  allowedDirectories?: 'any' | string[]
  /** Accepted clock drift in seconds. Default 60. */
  clockSkewSec?: number
  /** Max `expires - created`, seconds. Default 86400 (spec: ≤ 24 h recommended). */
  maxValiditySec?: number
  /** Reject signatures without a `nonce`. Default false. */
  requireNonce?: boolean
  replayCache?: ReplayCache
  /** Override `@authority` when a proxy rewrites Host. */
  authority?: (request: Request, url: URL) => string
  /** Node only: DNS-check directory hosts for private addresses. Default true. */
  resolveDns?: boolean
  /** Test seams. */
  fetch?: typeof fetch
  now?: () => number
}

export type WebBotAuthResult =
  | { status: 'absent' }
  | {
      status: 'verified'
      /** Stable identity: the signer URL (directory origin or JWKS URL). */
      agentUrl: string
      keyid: string
      label: string
      alg: SignatureAlgorithm
      created: number
      expires: number
    }
  | { status: 'invalid'; reason: string; agentUrl?: string; keyid?: string }

// ---- key directory cache ---------------------------------------------------

interface CachedDirectory {
  keys: PublicJwk[]
  thumbprints: string[]
  until: number
}
const directoryCache = new Map<string, CachedDirectory | { failedUntil: number }>()
const MAX_CACHED = 256
const NEGATIVE_TTL = 5 * 60 * 1000

export const __clearDirectoryCache = () => directoryCache.clear()

function cacheTtlMs(headers: Headers): number {
  const cc = headers.get('cache-control') ?? ''
  const m = cc.match(/max-age=(\d+)/i)
  const secs = m ? Number(m[1]) : 3600
  return Math.min(Math.max(secs, 60), 86_400) * 1000
}

async function loadDirectory(url: string, opts: WebBotAuthOptions): Promise<CachedDirectory> {
  const cached = directoryCache.get(url)
  if (cached && 'failedUntil' in cached && cached.failedUntil > Date.now()) {
    throw new SignatureError('discovery_failed', 'recent discovery failure (cached)')
  }
  if (cached && 'keys' in cached && cached.until > Date.now()) return cached

  try {
    const res = await safeFetch(url, {
      ...(opts.fetch ? { fetch: opts.fetch } : {}),
      accept: `${DIRECTORY_MEDIA_TYPE}, application/jwk-set+json, application/json`,
      resolveDns: opts.resolveDns ?? true,
    })
    if (res.status !== 200) throw new SignatureError('discovery_failed', `directory returned ${res.status}`)
    let doc: unknown
    try {
      doc = JSON.parse(res.body)
    } catch {
      throw new SignatureError('discovery_failed', 'directory is not JSON')
    }
    const raw = (doc as { keys?: unknown }).keys
    if (!Array.isArray(raw)) throw new SignatureError('discovery_failed', 'directory has no keys array')
    const now = (opts.now?.() ?? Date.now() / 1000)
    const keys = raw.filter(
      (k): k is PublicJwk =>
        typeof k === 'object' &&
        k !== null &&
        typeof (k as PublicJwk).kty === 'string' &&
        ((k as PublicJwk).nbf === undefined || (k as PublicJwk).nbf! <= now) &&
        ((k as PublicJwk).exp === undefined || (k as PublicJwk).exp! > now)
    )
    const thumbprints = await Promise.all(keys.map((k) => jwkThumbprint(k).catch(() => '')))
    const entry = { keys, thumbprints, until: Date.now() + cacheTtlMs(res.headers) }
    if (directoryCache.size >= MAX_CACHED) directoryCache.delete(directoryCache.keys().next().value as string)
    directoryCache.set(url, entry)
    return entry
  } catch (e) {
    directoryCache.set(url, { failedUntil: Date.now() + NEGATIVE_TTL })
    if (e instanceof SignatureError) throw e
    throw new SignatureError('discovery_failed', (e as Error).message)
  }
}

function directoryUrlFor(member: Item): { signer: string; directoryUrl: string } {
  if (typeof member.value !== 'string') throw new SignatureError('invalid_signature_agent', 'must be a string')
  let url: URL
  try {
    url = new URL(member.value)
  } catch {
    throw new SignatureError('invalid_signature_agent', 'not a URL')
  }
  if (url.protocol !== 'https:') throw new SignatureError('invalid_signature_agent', 'HTTPS required')
  const typeParam = getParam(member.params, 'type')
  const type = typeParam instanceof SfToken ? typeParam.value : typeof typeParam === 'string' ? typeParam : 'directory'
  if (type === 'directory') return { signer: url.origin, directoryUrl: url.origin + DIRECTORY_PATH }
  if (type === 'jwks_uri') return { signer: url.href, directoryUrl: url.href }
  throw new SignatureError('unsupported_signature_agent_type', type)
}

function isAllowed(signer: string, allowed: WebBotAuthOptions['allowedDirectories']): boolean {
  if (!allowed || allowed === 'any') return true
  return allowed.some((a) => {
    try {
      const u = new URL(a)
      return u.origin === signer || u.href === signer || new URL(signer).origin === u.origin
    } catch {
      return false
    }
  })
}

// ---- verification ------------------------------------------------------------

export async function verifyWebBotAuth(request: Request, opts: WebBotAuthOptions = {}): Promise<WebBotAuthResult> {
  const sigHeader = request.headers.get('signature')
  const inputHeader = request.headers.get('signature-input')
  if (!sigHeader && !inputHeader) return { status: 'absent' }
  if (!sigHeader || !inputHeader) return { status: 'invalid', reason: 'signature_headers_incomplete' }

  let inputs, sigs
  try {
    inputs = parseDictionary(inputHeader)
    sigs = parseDictionary(sigHeader)
  } catch (e) {
    return { status: 'invalid', reason: `malformed_signature_headers: ${(e as Error).message}` }
  }

  // Only signatures tagged web-bot-auth are ours; others (e.g. unrelated
  // HTTP signatures) are ignored, not failed.
  const candidates = [...inputs.entries()].filter(
    ([, m]) => isInnerList(m) && getParam(m.params, 'tag') === WEB_BOT_AUTH_TAG
  ) as Array<[string, InnerList]>
  if (candidates.length === 0) return { status: 'absent' }

  let lastFailure: WebBotAuthResult = { status: 'invalid', reason: 'no_valid_signature' }
  for (const [label, input] of candidates) {
    const r = await verifyOne(request, label, input, sigs.get(label), opts)
    if (r.status === 'verified') return r
    lastFailure = r
  }
  return lastFailure
}

async function verifyOne(
  request: Request,
  label: string,
  input: InnerList,
  sigMember: ReturnType<ReturnType<typeof parseDictionary>['get']>,
  opts: WebBotAuthOptions
): Promise<WebBotAuthResult> {
  const fail = (reason: string, extra: { agentUrl?: string; keyid?: string } = {}): WebBotAuthResult => ({
    status: 'invalid',
    reason,
    ...extra,
  })
  if (!sigMember || isInnerList(sigMember) || !(sigMember.value instanceof Uint8Array)) {
    return fail('signature_missing_for_label')
  }
  const signature = sigMember.value

  // 1. required parameters
  const created = getParam(input.params, 'created')
  const expires = getParam(input.params, 'expires')
  const keyid = getParam(input.params, 'keyid')
  const nonce = getParam(input.params, 'nonce')
  if (typeof created !== 'number' || typeof expires !== 'number') return fail('created_and_expires_required')
  if (typeof keyid !== 'string') return fail('keyid_required')
  if (nonce !== undefined && typeof nonce !== 'string') return fail('invalid_nonce')
  if (opts.requireNonce && nonce === undefined) return fail('nonce_required', { keyid })

  // 2. time window
  const now = Math.floor(opts.now?.() ?? Date.now() / 1000)
  const skew = opts.clockSkewSec ?? 60
  if (created > now + skew) return fail('created_in_future', { keyid })
  if (expires < now - skew) return fail('expired', { keyid })
  if (expires <= created) return fail('expires_before_created', { keyid })
  if (expires - created > (opts.maxValiditySec ?? 86_400)) return fail('validity_window_too_long', { keyid })

  // 3. covered components: @authority or @target-uri, plus signature-agent
  const names = input.items.map((i) => i.value)
  if (!names.includes('@authority') && !names.includes('@target-uri')) {
    return fail('authority_or_target_uri_not_covered', { keyid })
  }
  const agentComponent = input.items.find((i) => i.value === 'signature-agent')
  if (!agentComponent) return fail('signature_agent_not_covered', { keyid })

  // 4. Signature-Agent → signer + directory
  const agentHeader = request.headers.get('signature-agent')
  if (!agentHeader) return fail('signature_agent_missing', { keyid })
  let member: Item
  try {
    const key = getParam(agentComponent.params, 'key')
    if (typeof key === 'string') {
      const m = parseDictionary(agentHeader).get(key)
      if (!m || isInnerList(m)) return fail('signature_agent_member_missing', { keyid })
      member = m
    } else {
      member = parseItem(agentHeader) // legacy sf-string form
    }
  } catch (e) {
    return fail(`malformed_signature_agent: ${(e as Error).message}`, { keyid })
  }
  let signer: string, directoryUrl: string
  try {
    ;({ signer, directoryUrl } = directoryUrlFor(member))
  } catch (e) {
    return fail((e as SignatureError).code ?? 'invalid_signature_agent', { keyid })
  }
  if (!isAllowed(signer, opts.allowedDirectories)) return fail('signer_not_allowed', { agentUrl: signer, keyid })

  // 5. replay check (read-only; recorded only after a valid signature)
  const replayKey = nonce ? `${signer}|${keyid}|${nonce}` : undefined
  if (replayKey && (await opts.replayCache?.has(replayKey))) return fail('replayed_nonce', { agentUrl: signer, keyid })

  // 6. key lookup — keyed on the (signer URL, key) pair, by thumbprint
  let dir: CachedDirectory
  try {
    dir = await loadDirectory(directoryUrl, opts)
  } catch (e) {
    return fail((e as SignatureError).code ?? 'discovery_failed', { agentUrl: signer, keyid })
  }
  const idx = dir.thumbprints.indexOf(keyid)
  if (idx < 0) return fail('unknown_keyid', { agentUrl: signer, keyid })
  const jwk = dir.keys[idx]!

  // 7. rebuild the signature base and verify
  try {
    const url = new URL(request.url)
    const alg = resolveAlgorithm(jwk, getParam(input.params, 'alg'))
    const base = signatureBase(input, {
      request,
      url,
      ...(opts.authority ? { authority: opts.authority(request, url) } : {}),
    })
    const ok = await verifySignature(alg, jwk, base, signature)
    if (!ok) return fail('bad_signature', { agentUrl: signer, keyid })
    if (replayKey) await opts.replayCache?.add(replayKey, Math.max(expires - now, 1) + skew)
    return { status: 'verified', agentUrl: signer, keyid, label, alg, created, expires }
  } catch (e) {
    return fail(e instanceof SignatureError ? e.code : 'verification_error', { agentUrl: signer, keyid })
  }
}
