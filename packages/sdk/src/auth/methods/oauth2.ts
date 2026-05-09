import type { AuthMethod } from '../engine.js'

export const oauth2 = (): AuthMethod => ({
  name: 'oauth2',
  async authenticate(input, context) {
    if (!input.oauth2AccessToken) return null
    const verified = await context.verifyToken?.('oauth2', input.oauth2AccessToken)
    return {
      class: input.classHint ?? 'webmcp',
      trust: input.oauth2Subject ? 'linked' : verified?.trust ?? 'verified',
      confidence: 1,
      vendor: verified?.vendor ?? input.vendorHint ?? 'oauth2',
      userAgent: typeof navigator === 'undefined' ? null : navigator.userAgent,
      detectionVersion: '2026.04',
      signals: {
        oauth2: true,
        subject: input.oauth2Subject ?? null,
        verifiedRemotely: Boolean(verified),
      },
    }
  },
})
