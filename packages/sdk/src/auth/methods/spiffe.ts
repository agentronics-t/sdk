import type { AuthMethod } from '../engine.js'
import { SDK_VERSION } from "../../version.js"

// SPIFFE JWT-SVID verification. The gateway validates against the site's
// configured SPIFFE Bundle (JWKS with `use: "jwt-svid"`) and returns the
// SPIFFE ID as `verified.subject`. When the trust domain matches one of
// the customer-configured Google trust domains (D1), the verifier sets
// `vendor: 'google'` so we surface `googleAgent: true` and the engine
// emits `protocol: 'google-agent'` on the trace instead of 'spiffe'.
export const spiffe = (): AuthMethod => ({
  name: 'spiffe',
  async authenticate(input, context) {
    if (!input.spiffeJwt) return null
    const verified = await context.verifyToken?.('spiffe', input.spiffeJwt)
    const isGoogleFlavor = verified?.vendor === 'google'
    return {
      class: input.classHint ?? 'webmcp',
      trust: verified?.trust ?? 'verified',
      confidence: 1,
      vendor: verified?.vendor ?? input.vendorHint ?? 'spiffe',
      userAgent: typeof navigator === 'undefined' ? null : navigator.userAgent,
      detectionVersion: SDK_VERSION,
      signals: {
        spiffe: true,
        spiffeId: verified?.subject ?? null,
        subject: verified?.subject ?? null,
        verifiedRemotely: Boolean(verified),
        ...(isGoogleFlavor ? { googleAgent: true } : {}),
        ...(verified?.signals ?? {}),
      },
    }
  },
})
