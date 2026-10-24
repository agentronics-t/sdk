/**
 * Agent authentication for any HTTP request — the server half of the SDK.
 *
 *   const auth = createAgentAuth({ apiKey: { verify } })
 *   const result = await auth.authenticate(request)   // Fetch API Request
 *
 * Authentication never blocks. A verified agent gets a stable identity your
 * routes can read; an unverified agent (or a human) browses exactly as before.
 *
 * Methods, strongest first: Web Bot Auth (RFC 9421 signed agents), agent API
 * keys, OAuth 2.1 access tokens (app-only or acting for a user, optionally
 * DPoP-bound), and verified crawlers (published IP ranges or forward-confirmed
 * reverse DNS). Everything runs on Node ≥ 20 and edge runtimes except crawler
 * rDNS, which needs Node DNS (it degrades to "unverified", never "verified").
 */
import type { TraceEvent } from '@agentronics/protocol'
import { classifyUserAgent, clientIp, verifyCrawler, type ClientIpSource, type DnsResolver } from './crawlers.js'
import type { IpRangeOptions } from './ipRanges.js'
import { unverifiedIssuer, verifyOAuthToken, type OAuth2Options } from './oauth.js'
import { bytesToBase64Url } from './structuredFields.js'
import { memoryReplayCache, verifyWebBotAuth, type ReplayCache, type WebBotAuthOptions } from './webBotAuth.js'

export type { OAuth2Options } from './oauth.js'

export type AgentAuthMethod = 'web-bot-auth' | 'api-key' | 'oauth2' | 'verified-crawler'

export interface VerifiedAgent {
  /** Stable id: signer URL, API-key agent id, OAuth client id, or crawler name. */
  id: string
  name: string
  vendor: string | null
  method: AgentAuthMethod
  claims?: Record<string, unknown>
  /** OAuth delegated tokens: the user this agent is acting for. */
  onBehalfOf?: { sub: string; email?: string; name?: string }
}

export type AgentAuthResult =
  | { status: 'verified'; agent: VerifiedAgent }
  | { status: 'unverified'; reason: string; claimedName?: string; attempted: AgentAuthMethod[] }
  | { status: 'none' }

export interface ApiKeyIdentity {
  agentId: string
  name?: string
  vendor?: string
  scopes?: string[]
}

export interface ApiKeyOptions {
  /** Key prefix that marks a bearer token as an agent key. Default `agk_`. */
  prefix?: string
  /** Look the key up. Return null for unknown/revoked keys. */
  verify: (key: string) => ApiKeyIdentity | null | Promise<ApiKeyIdentity | null>
}

export interface CrawlerOptions extends IpRangeOptions {
  /** Where to read the client IP. Default 'auto' (platform headers only). */
  clientIp?: ClientIpSource
  /** Test seam / custom resolver. */
  resolver?: DnsResolver
}

export interface AgentAuthOptions {
  /** Web Bot Auth (on by default). `false` disables it. */
  webBotAuth?: boolean | WebBotAuthOptions
  apiKey?: ApiKeyOptions
  /** One issuer, or several (e.g. your own auth server plus a partner's). */
  oauth2?: OAuth2Options | OAuth2Options[]
  /** Shared replay cache for Web Bot Auth nonces and DPoP proof ids. Default in-memory. */
  replayCache?: ReplayCache
  /** Verified crawlers (on by default). `false` disables it. */
  crawlers?: boolean | CrawlerOptions
}

/** Signers we can name. Everything else is shown by hostname. */
const KNOWN_SIGNERS: Record<string, { name: string; vendor: string }> = {
  'https://chatgpt.com': { name: 'ChatGPT agent', vendor: 'OpenAI' },
}

const GENERIC_AGENT_UA = /\b(bot|crawler|spider|agent|headless|scraper)\b/i
const JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/

/** The credential in `Authorization: Bearer|DPoP <token>`, with its scheme. */
function credential(request: Request): { token: string; scheme: 'bearer' | 'dpop' } | null {
  const h = request.headers.get('authorization')
  const m = h?.match(/^(bearer|dpop)\s+(.+)$/i)
  return m ? { token: m[2]!.trim(), scheme: m[1]!.toLowerCase() as 'bearer' | 'dpop' } : null
}

export function createAgentAuth(options: AgentAuthOptions = {}) {
  const replayCache = options.replayCache ?? memoryReplayCache()
  const wba: WebBotAuthOptions | null =
    options.webBotAuth === false
      ? null
      : { replayCache, ...(typeof options.webBotAuth === 'object' ? options.webBotAuth : {}) }
  const issuers = options.oauth2 ? (Array.isArray(options.oauth2) ? options.oauth2 : [options.oauth2]) : []
  const crawlers: CrawlerOptions | null =
    options.crawlers === false ? null : typeof options.crawlers === 'object' ? options.crawlers : {}
  const keyPrefix = options.apiKey?.prefix ?? 'agk_'

  async function authenticate(request: Request): Promise<AgentAuthResult> {
    const attempted: AgentAuthMethod[] = []
    const reasons: string[] = []
    let claimedName: string | undefined

    // 1. Web Bot Auth
    if (wba) {
      const r = await verifyWebBotAuth(request, wba)
      if (r.status === 'verified') {
        const known = KNOWN_SIGNERS[r.agentUrl]
        const host = new URL(r.agentUrl).hostname
        return {
          status: 'verified',
          agent: {
            id: r.agentUrl,
            name: known?.name ?? host,
            vendor: known?.vendor ?? null,
            method: 'web-bot-auth',
            claims: { keyid: r.keyid, alg: r.alg },
          },
        }
      }
      if (r.status === 'invalid') {
        attempted.push('web-bot-auth')
        reasons.push(`web-bot-auth:${r.reason}`)
        claimedName ??= r.agentUrl ? new URL(r.agentUrl).hostname : undefined
      }
    }

    // 2/3. Credentials — agent API key or OAuth 2.1 access token
    const cred = credential(request)
    const token = cred?.token ?? request.headers.get('x-agent-key')
    if (token && options.apiKey && token.startsWith(keyPrefix)) {
      attempted.push('api-key')
      const id = await options.apiKey.verify(token)
      if (id) {
        return {
          status: 'verified',
          agent: {
            id: `key:${id.agentId}`,
            name: id.name ?? id.agentId,
            vendor: id.vendor ?? null,
            method: 'api-key',
            ...(id.scopes ? { claims: { scopes: id.scopes } } : {}),
          },
        }
      }
      reasons.push('api-key:unknown_or_revoked')
    } else if (cred && issuers.length && JWT_SHAPE.test(cred.token)) {
      // Only tokens from a configured issuer are agent credentials — a user's
      // session JWT from another issuer is not agent traffic.
      const iss = unverifiedIssuer(cred.token)
      const config = issuers.find((i) => i.issuer === iss)
      if (config) {
        attempted.push('oauth2')
        const r = await verifyOAuthToken(cred.token, config, { request, scheme: cred.scheme, replayCache })
        if (!('error' in r)) {
          const agent: VerifiedAgent = {
            id: r.id,
            name: r.name,
            vendor: r.vendor,
            method: 'oauth2',
            claims: { ...r.claims, dpop: r.dpop },
          }
          if (r.onBehalfOf) agent.onBehalfOf = r.onBehalfOf
          return { status: 'verified', agent }
        }
        reasons.push(`oauth2:${r.error}`)
      }
    }

    // 4. Crawler claim → forward-confirmed reverse DNS
    const ua = request.headers.get('user-agent')
    const claim = classifyUserAgent(ua)
    if (claim) {
      claimedName ??= claim.name
      if (crawlers) {
        attempted.push('verified-crawler')
        const v = await verifyCrawler(claim, clientIp(request, crawlers.clientIp), crawlers.resolver, crawlers)
        if (v.status === 'verified') {
          return {
            status: 'verified',
            agent: { id: `crawler:${claim.name}`, name: claim.name, vendor: null, method: 'verified-crawler', claims: { host: v.host, via: v.via } },
          }
        }
        reasons.push(`crawler:${v.reason}`)
      } else reasons.push('crawler:verification_disabled')
    }

    if (attempted.length || claim || (ua && GENERIC_AGENT_UA.test(ua)) || request.headers.has('signature-agent')) {
      return {
        status: 'unverified',
        reason: reasons[0] ?? 'agent_claim_without_credentials',
        ...(claimedName ? { claimedName } : {}),
        attempted,
      }
    }
    return { status: 'none' }
  }

  return { authenticate }
}

// ---- helpers: API keys ---------------------------------------------------------

/** SHA-256 hex of an agent key — store this, never the key. */
export async function hashAgentKey(key: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key))
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Verifier over a static map of `sha256(key) → identity` (e.g. from env/config). */
export function staticKeyVerifier(hashedKeys: Record<string, ApiKeyIdentity>): ApiKeyOptions['verify'] {
  return async (key) => hashedKeys[await hashAgentKey(key)] ?? null
}

/** Mint a new agent key (`agk_` + 32 random bytes, base64url). Show it once; store its hash. */
export function generateAgentKey(prefix = 'agk_'): string {
  return prefix + bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)))
}

// ---- helpers: headers + tracing ------------------------------------------------

export const AGENT_HEADERS = {
  status: 'x-agentronics-agent-status',
  id: 'x-agentronics-agent-id',
  name: 'x-agentronics-agent-name',
  vendor: 'x-agentronics-agent-vendor',
  method: 'x-agentronics-auth-method',
} as const

/**
 * Request headers to forward downstream, with the auth result attached.
 * Any incoming `x-agentronics-*` header is stripped first so a caller can
 * never forge a verified identity.
 */
export function withAgentHeaders(request: Request, result: AgentAuthResult): Headers {
  const h = new Headers(request.headers)
  for (const k of [...h.keys()]) if (k.toLowerCase().startsWith('x-agentronics-')) h.delete(k)
  h.set(AGENT_HEADERS.status, result.status)
  if (result.status === 'verified') {
    h.set(AGENT_HEADERS.id, result.agent.id)
    h.set(AGENT_HEADERS.name, result.agent.name)
    h.set(AGENT_HEADERS.method, result.agent.method)
    if (result.agent.vendor) h.set(AGENT_HEADERS.vendor, result.agent.vendor)
  }
  return h
}

/**
 * Read the forwarded result in a route handler (only trust it behind the
 * middleware). Accepts anything with `get()` — `Headers`, Next's read-only
 * `headers()`, or a plain adapter.
 */
export function readAgentHeaders(headers: { get(name: string): string | null }) {
  const status = headers.get(AGENT_HEADERS.status) as AgentAuthResult['status'] | null
  return {
    status: status ?? 'none',
    id: headers.get(AGENT_HEADERS.id),
    name: headers.get(AGENT_HEADERS.name),
    vendor: headers.get(AGENT_HEADERS.vendor),
    method: headers.get(AGENT_HEADERS.method) as AgentAuthMethod | null,
  }
}

/**
 * Map a result to an SDK trace event so server-side auth shows up in the
 * console's Auth + Logs pages next to in-browser agents. Returns null for
 * non-agent traffic. Server-side agents use class `crawler` (HTTP fetchers);
 * the method is in `metadata.protocol`.
 */
export function toTraceEvent(result: AgentAuthResult, ctx: { siteId: string; request: Request }): TraceEvent | null {
  if (result.status === 'none') return null
  const url = new URL(ctx.request.url)
  const verified = result.status === 'verified'
  const delegated = verified && Boolean(result.agent.onBehalfOf)
  return {
    id: `evt_${crypto.randomUUID()}`,
    siteId: ctx.siteId,
    sessionId: verified ? result.agent.id : `unverified:${result.claimedName ?? 'unknown'}`,
    occurredAt: new Date().toISOString(),
    type: 'auth.identity_presented',
    agent: {
      class: 'crawler',
      // Unverified claims stay "declared"; a token acting for a signed-in user is "linked".
      trust: delegated ? 'linked' : verified ? 'verified' : 'declared',
      confidence: verified ? 1 : 0.5,
      vendor: verified ? (result.agent.vendor ?? result.agent.name) : (result.claimedName ?? null),
      userAgent: ctx.request.headers.get('user-agent'),
      detectionVersion: '2026.09',
      signals: { surface: 'server', ...(verified ? { method: result.agent.method } : {}) },
    },
    outcome: verified ? 'success' : 'error',
    ...(verified ? {} : { error: result.reason }),
    metadata: {
      protocol: verified ? result.agent.method : (result.attempted[0] ?? 'none'),
      ...(verified ? { subject: result.agent.id } : {}),
      page: url.pathname,
    },
  }
}
