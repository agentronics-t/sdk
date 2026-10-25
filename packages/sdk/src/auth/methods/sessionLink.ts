import type { AuthMethod } from '../engine.js'
import { SDK_VERSION } from "../../version.js"

export const sessionLink = (): AuthMethod => ({
  name: 'sessionLink',
  async authenticate(input, context) {
    if (!input.sessionLinkToken) return null
    const verified = await context.verifyToken?.('sessionLink', input.sessionLinkToken)
    return {
      class: input.classHint ?? 'screenshot',
      trust: verified ? (input.linkedUserId && verified.trust !== 'detected' && verified.trust !== 'declared' ? 'linked' : verified.trust) : 'declared',
      confidence: 1,
      vendor: verified?.vendor ?? input.vendorHint ?? 'session-link',
      userAgent: typeof navigator === 'undefined' ? null : navigator.userAgent,
      detectionVersion: SDK_VERSION,
      signals: {
        sessionLink: true,
        linkedUserId: input.linkedUserId ?? null,
        verifiedRemotely: Boolean(verified),
      },
    }
  },
})
