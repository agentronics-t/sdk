import { createLocalJWKSet, jwtVerify, type JWK, type JWTVerifyGetKey } from 'jose'
import type { VerificationResult } from '@agentronics/protocol'
import type { SpiffeConfig } from '../../storage/types.js'

// Per SPIFFE JWT-SVID spec: signature algs are the JOSE asymmetric set.
// We reject 'none' and HS* by allowlist.
const SPIFFE_ALLOWED_ALGS = [
  'RS256',
  'RS384',
  'RS512',
  'ES256',
  'ES384',
  'ES512',
  'PS256',
  'PS384',
  'PS512',
]

interface ParsedSpiffeId {
  trustDomain: string
  path: string
}

const parseSpiffeId = (value: unknown): ParsedSpiffeId | null => {
  if (typeof value !== 'string' || !value.startsWith('spiffe://')) return null
  try {
    const url = new URL(value)
    if (!url.host) return null
    return { trustDomain: url.host, path: url.pathname }
  } catch {
    return null
  }
}

export interface VerifySpiffeOptions {
  jwks?: JWTVerifyGetKey
  fetcher?: typeof fetch
}

// SPIFFE bundles publish JWKs with `use: "jwt-svid"`. jose's default
// LocalJWKSet filters by JOSE-standard `use` values (`sig`, `enc`), so
// `jwt-svid` keys would be silently rejected. We fetch the bundle,
// rewrite `jwt-svid` → `sig`, and hand the normalized set to jose.
interface SpiffeBundleEntry {
  bundle: JWTVerifyGetKey
  expires: number
}
const BUNDLE_TTL_MS = 60 * 60 * 1000 // 1h
const bundleCache = new Map<string, SpiffeBundleEntry>()

const fetchSpiffeBundle = async (
  endpoint: string,
  fetcher: typeof fetch
): Promise<JWTVerifyGetKey> => {
  const cached = bundleCache.get(endpoint)
  if (cached && cached.expires > Date.now()) return cached.bundle
  const res = await fetcher(endpoint)
  if (!res.ok) throw new Error(`spiffe_bundle_fetch_failed:${res.status}`)
  const doc = (await res.json()) as { keys?: JWK[] }
  if (!Array.isArray(doc.keys)) throw new Error('spiffe_bundle_missing_keys')
  const normalized: JWK[] = doc.keys
    .filter((key) => key.use === 'jwt-svid' || key.use === 'sig' || key.use === undefined)
    .map((key) => (key.use === 'jwt-svid' ? { ...key, use: 'sig' } : key))
  const bundle = createLocalJWKSet({ keys: normalized })
  bundleCache.set(endpoint, { bundle, expires: Date.now() + BUNDLE_TTL_MS })
  return bundle
}

export const verifySpiffeJwt = async (
  token: string,
  config: SpiffeConfig,
  { jwks: injectedJwks, fetcher = fetch }: VerifySpiffeOptions = {}
): Promise<VerificationResult> => {
  const jwks = injectedJwks ?? (await fetchSpiffeBundle(config.bundleEndpoint, fetcher))
  const { payload } = await jwtVerify(token, jwks, {
    audience: config.audiences,
    algorithms: SPIFFE_ALLOWED_ALGS,
  })
  const spiffeId = parseSpiffeId(payload.sub)
  if (!spiffeId) throw new Error('spiffe_invalid_sub')
  const matchesPrimary = spiffeId.trustDomain === config.trustDomain
  const matchesGoogle = config.googleTrustDomains?.includes(spiffeId.trustDomain) ?? false
  if (!matchesPrimary && !matchesGoogle) {
    throw new Error('spiffe_trust_domain_mismatch')
  }

  const signals: Record<string, unknown> = { trustDomain: spiffeId.trustDomain }
  if (matchesGoogle) {
    // Lift well-known Google agent claims when present so the dashboard
    // doesn't have to re-parse the JWT to render "agent X owned by Y".
    for (const key of ['agent_id', 'agent_name', 'agent_owner']) {
      const value = (payload as Record<string, unknown>)[key]
      if (value !== undefined) signals[key] = value
    }
  }

  const validUntil = payload.exp
    ? new Date(payload.exp * 1000).toISOString()
    : new Date(Date.now() + 60_000).toISOString()

  return {
    trust: 'verified',
    vendor: matchesGoogle ? 'google' : spiffeId.trustDomain,
    validUntil,
    subject: payload.sub as string,
    protocol: matchesGoogle ? 'google-agent' : 'spiffe',
    signals,
  }
}
