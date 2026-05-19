import { createRemoteJWKSet } from 'jose'

// Shared in-process JWKS cache. jose's createRemoteJWKSet handles
// per-set fetching/caching internally; we wrap it so the SAME JWKS URI
// reuses the SAME JWKSet object across requests (avoiding redundant
// fetches on cold paths).
type JWKSet = ReturnType<typeof createRemoteJWKSet>
const cache = new Map<string, JWKSet>()

export const getRemoteJwks = (jwksUri: string): JWKSet => {
  let set = cache.get(jwksUri)
  if (!set) {
    set = createRemoteJWKSet(new URL(jwksUri), {
      cacheMaxAge: 60 * 60 * 1000, // 1h — typical IdP key rotation cadence
      cooldownDuration: 30_000, // 30s between misses to dampen 429s
    })
    cache.set(jwksUri, set)
  }
  return set
}

// Visible for tests so they can reset between runs.
export const __resetJwksCache = (): void => cache.clear()
