import type { AuthMethod } from '../engine.js'

export const bearer = (): AuthMethod => ({
  name: 'bearer',
  async authenticate(input, context) {
    if (!input.bearerToken) return null
    const verified = await context.verifyToken?.('bearer', input.bearerToken)
    return {
      class: input.classHint ?? 'dom',
      trust: verified?.trust ?? 'verified',
      confidence: 1,
      vendor: verified?.vendor ?? input.vendorHint ?? 'bearer',
      userAgent: typeof navigator === 'undefined' ? null : navigator.userAgent,
      detectionVersion: '2026.04',
      signals: { bearer: true, verifiedRemotely: Boolean(verified) },
    }
  },
})
