import type { AuthMethod } from '../engine.js'

// Workforce SSO via OIDC ID tokens. Browser/Node SDKs forward the ID
// token to the gateway's POST /v1/verify/sso route, which validates the
// JWT signature + claims against the customer-configured IdP discovery
// document. SAML is intentionally out of scope for v1.
export const sso = (): AuthMethod => ({
  name: 'sso',
  async authenticate(input, context) {
    if (!input.ssoIdToken) return null
    const verified = await context.verifyToken?.('sso', input.ssoIdToken)
    return {
      class: input.classHint ?? 'dom',
      trust: verified?.trust ?? 'verified',
      confidence: 1,
      vendor: verified?.vendor ?? input.vendorHint ?? 'sso',
      userAgent: typeof navigator === 'undefined' ? null : navigator.userAgent,
      detectionVersion: '2026.04',
      signals: {
        sso: true,
        subject: verified?.subject ?? null,
        verifiedRemotely: Boolean(verified),
        ...(verified?.signals ?? {}),
      },
    }
  },
})
