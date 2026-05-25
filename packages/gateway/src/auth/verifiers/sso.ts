import { jwtVerify, type JWTVerifyGetKey } from 'jose'
import type { VerificationResult } from '@agentronics/protocol'
import type { SsoConfig } from '../../storage/types.js'
import { getRemoteJwks } from './jwks.js'

interface DiscoveryDoc {
  jwks_uri?: string
}

interface DiscoveryEntry {
  jwksUri: string
  expires: number
}

const DISCOVERY_TTL_MS = 60 * 60 * 1000 // 1h
const discoveryCache = new Map<string, DiscoveryEntry>()

const discoverJwksUri = async (issuer: string, fetcher: typeof fetch): Promise<string> => {
  const cached = discoveryCache.get(issuer)
  if (cached && cached.expires > Date.now()) return cached.jwksUri
  const url = `${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`
  const res = await fetcher(url)
  if (!res.ok) throw new Error(`oidc_discovery_failed:${res.status}`)
  const doc = (await res.json()) as DiscoveryDoc
  if (!doc.jwks_uri) throw new Error('oidc_discovery_missing_jwks_uri')
  discoveryCache.set(issuer, { jwksUri: doc.jwks_uri, expires: Date.now() + DISCOVERY_TTL_MS })
  return doc.jwks_uri
}

export interface VerifyOidcOptions {
  fetcher?: typeof fetch
  // Inject a JWKS resolver to skip discovery + remote fetch — used by
  // tests with locally-minted JWKs (see createLocalJWKSet).
  jwks?: JWTVerifyGetKey
}

export const verifyOidcIdToken = async (
  token: string,
  config: SsoConfig,
  { fetcher = fetch, jwks: injectedJwks }: VerifyOidcOptions = {}
): Promise<VerificationResult> => {
  const jwks =
    injectedJwks ?? getRemoteJwks(await discoverJwksUri(config.issuer, fetcher))
  const { payload } = await jwtVerify(token, jwks, {
    issuer: config.issuer,
    audience: config.audiences,
    // Explicit tolerance for IdP / client clock drift. 120s is the de
    // facto enterprise default; tighter than the AWS / Okta / Azure
    // 300s convention but loose enough that a well-configured fleet
    // won't false-reject legitimate tokens during a clock-skew event.
    clockTolerance: 120,
  })
  const vendor = (() => {
    try {
      return new URL(config.issuer).host
    } catch {
      return config.issuer
    }
  })()
  const validUntil = payload.exp
    ? new Date(payload.exp * 1000).toISOString()
    : new Date(Date.now() + 60_000).toISOString()
  return {
    trust: 'verified',
    vendor,
    validUntil,
    ...(typeof payload.sub === 'string' ? { subject: payload.sub } : {}),
    protocol: 'sso',
  }
}

export const __resetDiscoveryCache = (): void => discoveryCache.clear()
