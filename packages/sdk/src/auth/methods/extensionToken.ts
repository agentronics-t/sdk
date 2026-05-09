import type { AuthMethod } from '../engine.js'

export const extensionToken = (): AuthMethod => ({
  name: 'extensionToken',
  async authenticate(input, context) {
    if (!input.extensionToken) return null
    const verified = await context.verifyToken?.('extensionToken', input.extensionToken)
    return {
      class: 'dom',
      trust: verified?.trust ?? 'verified',
      confidence: 1,
      vendor: verified?.vendor ?? input.vendorHint ?? 'browser-extension',
      userAgent: typeof navigator === 'undefined' ? null : navigator.userAgent,
      detectionVersion: '2026.04',
      signals: { extensionToken: true, verifiedRemotely: Boolean(verified) },
    }
  },
})
