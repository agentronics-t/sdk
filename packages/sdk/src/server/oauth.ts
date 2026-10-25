/**
 * OAuth 2.1 access tokens presented by agents.
 *
 * Covers the two shapes agents actually use:
 * - **App-only** (client credentials): the token names the agent's client and
 *   no user. → a verified agent.
 * - **Delegated** (authorization code, the MCP authorization flow, or token
 *   exchange with an RFC 8693 `act` claim): the token names a user *and* the
 *   agent acting for them. → a verified agent acting on behalf of that user.
 *
 * Tokens are JWTs checked against each configured issuer's JWKS (issuer,
 * audience / RFC 8707 resource, expiry, algorithms, scopes). Sender-constrained
 * tokens (RFC 9449 DPoP, `cnf.jkt`) must arrive with a valid `DPoP` proof.
 * Opaque tokens are out of scope — use an issuer that mints JWT access tokens.
 */
import type * as Jose from 'jose'
import type { ReplayCache } from './webBotAuth.js'
import { bytesToBase64Url } from './structuredFields.js'

export interface OAuth2Options {
  issuer: string
  /** The audience / resource indicator this site accepts (RFC 8707). */
  audience: string | string[]
  /** Default `<issuer>/.well-known/jwks.json`. */
  jwksUri?: string
  /** Static JWKS (tests / pinned keys) instead of fetching `jwksUri`. */
  jwks?: { keys: JsonWebKey[] }
  requiredScopes?: string[]
  algorithms?: string[]
  clockToleranceSec?: number
  /** Refuse tokens that aren't DPoP-bound. Default false (bound tokens are always checked). */
  requireDpop?: boolean
}

export interface OAuthAgent {
  id: string
  name: string
  vendor: string | null
  claims: Record<string, unknown>
  /** Present for delegated tokens: the user the agent acts for. */
  onBehalfOf?: { sub: string; email?: string; name?: string }
  dpop: boolean
}

type JoseModule = typeof Jose
let josePromise: Promise<JoseModule> | undefined
const loadJose = () => (josePromise ??= import('jose'))
const remoteSets = new Map<string, ReturnType<JoseModule['createRemoteJWKSet']>>()

const ASYMMETRIC = ['RS256', 'PS256', 'ES256', 'EdDSA']

/** `iss` of an unverified JWT — only used to pick which issuer config to verify against. */
export function unverifiedIssuer(token: string): string | null {
  try {
    const payload = token.split('.')[1]!
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    const iss = (JSON.parse(json) as { iss?: unknown }).iss
    return typeof iss === 'string' ? iss : null
  } catch {
    return null
  }
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined)

async function sha256B64u(text: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return bytesToBase64Url(new Uint8Array(d))
}

/** The request URL as DPoP's `htu`: no query, no fragment. */
const htuOf = (url: string) => {
  const u = new URL(url)
  return `${u.origin}${u.pathname}`
}

async function verifyDpopProof(
  jose: JoseModule,
  proof: string,
  token: string,
  jkt: string,
  request: Request,
  replay: ReplayCache | undefined
): Promise<string | null> {
  try {
    const { payload, protectedHeader } = await jose.jwtVerify(proof, jose.EmbeddedJWK, {
      typ: 'dpop+jwt',
      algorithms: ASYMMETRIC,
    })
    const jwk = protectedHeader.jwk
    if (!jwk) return 'dpop_missing_jwk'
    if ((await jose.calculateJwkThumbprint(jwk, 'sha256')) !== jkt) return 'dpop_key_mismatch'
    if (str(payload.htm)?.toUpperCase() !== request.method.toUpperCase()) return 'dpop_htm_mismatch'
    if (str(payload.htu) === undefined || htuOf(str(payload.htu)!) !== htuOf(request.url)) return 'dpop_htu_mismatch'
    const iat = typeof payload.iat === 'number' ? payload.iat : NaN
    if (!Number.isFinite(iat) || Math.abs(Date.now() / 1000 - iat) > 300) return 'dpop_stale'
    if (str(payload.ath) !== (await sha256B64u(token))) return 'dpop_ath_mismatch'
    const jti = str(payload.jti)
    if (!jti) return 'dpop_missing_jti'
    if (replay) {
      const key = `dpop:${jkt}:${jti}`
      if (await replay.has(key)) return 'dpop_replayed'
      await replay.add(key, 600)
    }
    return null
  } catch (e) {
    return `dpop_invalid:${(e as { code?: string }).code ?? (e as Error).message}`
  }
}

export async function verifyOAuthToken(
  token: string,
  o: OAuth2Options,
  ctx: { request: Request; scheme: 'bearer' | 'dpop'; replayCache?: ReplayCache }
): Promise<OAuthAgent | { error: string }> {
  const jose = await loadJose()
  const keySet = o.jwks
    ? jose.createLocalJWKSet(o.jwks as Parameters<JoseModule['createLocalJWKSet']>[0])
    : (() => {
        const uri = o.jwksUri ?? `${o.issuer.replace(/\/$/, '')}/.well-known/jwks.json`
        let s = remoteSets.get(uri)
        if (!s) {
          s = jose.createRemoteJWKSet(new URL(uri), { cacheMaxAge: 3_600_000, cooldownDuration: 30_000 })
          remoteSets.set(uri, s)
        }
        return s
      })()

  let payload: Jose.JWTPayload
  try {
    ;({ payload } = await jose.jwtVerify(token, keySet, {
      issuer: o.issuer,
      audience: o.audience,
      algorithms: o.algorithms ?? ASYMMETRIC,
      clockTolerance: o.clockToleranceSec ?? 30,
    }))
  } catch (e) {
    return { error: `invalid_token:${(e as { code?: string }).code ?? (e as Error).message}` }
  }

  // Sender-constrained token: the caller must prove possession of the key.
  const jkt = str((payload.cnf as { jkt?: unknown } | undefined)?.jkt)
  let dpop = false
  if (jkt) {
    const proof = ctx.request.headers.get('dpop')
    if (ctx.scheme !== 'dpop' || !proof) return { error: 'dpop_proof_required' }
    const bad = await verifyDpopProof(jose, proof, token, jkt, ctx.request, ctx.replayCache)
    if (bad) return { error: bad }
    dpop = true
  } else if (o.requireDpop) {
    return { error: 'token_not_dpop_bound' }
  }

  if (o.requiredScopes?.length) {
    const granted = new Set(String(payload.scope ?? payload.scp ?? '').split(/\s+/))
    const missing = o.requiredScopes.filter((s) => !granted.has(s))
    if (missing.length) return { error: `missing_scopes:${missing.join(',')}` }
  }

  // Who is the agent, and is there a user behind it?
  const act = payload.act as { sub?: unknown; client_id?: unknown } | undefined
  const clientId = str(payload.client_id) ?? str(payload.azp)
  const sub = str(payload.sub)
  const agentId = str(act?.client_id) ?? str(act?.sub) ?? clientId ?? sub
  if (!agentId) return { error: 'token_has_no_client_id' }
  const user = act ? sub : sub && clientId && sub !== clientId ? sub : undefined

  const agent: OAuthAgent = {
    id: `oauth2:${agentId}`,
    name: str(payload.agent_name) ?? str(payload.client_name) ?? agentId,
    vendor: str(payload.agent_vendor) ?? null,
    claims: { iss: payload.iss, sub, scope: payload.scope ?? payload.scp, ...(act ? { act } : {}) },
    dpop,
  }
  if (user) {
    const onBehalfOf: NonNullable<OAuthAgent['onBehalfOf']> = { sub: user }
    if (str(payload.email)) onBehalfOf.email = str(payload.email)!
    if (str(payload.name)) onBehalfOf.name = str(payload.name)!
    agent.onBehalfOf = onBehalfOf
  }
  return agent
}

// ---- RFC 9728 protected-resource metadata (what MCP clients discover) ----------

export const PROTECTED_RESOURCE_PATH = '/.well-known/oauth-protected-resource'

export interface ProtectedResourceOptions {
  /** This site's resource identifier, e.g. `https://shop.example`. */
  resource: string
  /** Authorization servers agents should get tokens from. */
  authorizationServers: string[]
  scopesSupported?: string[]
  resourceName?: string
  /** Advertise DPoP support. Default true. */
  dpop?: boolean
}

/** JSON for `GET /.well-known/oauth-protected-resource`. */
export function protectedResourceMetadata(o: ProtectedResourceOptions) {
  return {
    resource: o.resource,
    authorization_servers: o.authorizationServers,
    bearer_methods_supported: ['header'],
    ...(o.scopesSupported ? { scopes_supported: o.scopesSupported } : {}),
    ...(o.resourceName ? { resource_name: o.resourceName } : {}),
    ...(o.dpop === false ? {} : { dpop_signing_alg_values_supported: ['ES256', 'EdDSA', 'RS256', 'PS256'] }),
  }
}

/**
 * `WWW-Authenticate` value that tells an agent where to find the metadata
 * (RFC 9728 §5.1). Send it with a 401 only on routes that *require* a token —
 * Agentronics itself never blocks.
 */
export function oauthChallenge(resource: string, opts: { error?: string; scope?: string } = {}): string {
  const meta = `${resource.replace(/\/$/, '')}${PROTECTED_RESOURCE_PATH}`
  const parts = [`resource_metadata="${meta}"`]
  if (opts.error) parts.push(`error="${opts.error}"`)
  if (opts.scope) parts.push(`scope="${opts.scope}"`)
  return `Bearer ${parts.join(', ')}`
}
