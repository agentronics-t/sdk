import type { AuthMethod } from '../engine.js'
import { SDK_VERSION } from "../../version.js"

export const oauth2 = (): AuthMethod => ({
  name: 'oauth2',
  async authenticate(input, context) {
    if (!input.oauth2AccessToken) return null
    const verified = await context.verifyToken?.('oauth2', input.oauth2AccessToken)
    return {
      class: input.classHint ?? 'webmcp',
      // A user subject only links the session once a verifier has accepted the token.
      trust: verified ? (input.oauth2Subject && verified.trust !== 'detected' && verified.trust !== 'declared' ? 'linked' : verified.trust) : 'declared',
      confidence: 1,
      vendor: verified?.vendor ?? input.vendorHint ?? 'oauth2',
      userAgent: typeof navigator === 'undefined' ? null : navigator.userAgent,
      detectionVersion: SDK_VERSION,
      signals: {
        oauth2: true,
        subject: input.oauth2Subject ?? null,
        verifiedRemotely: Boolean(verified),
      },
    }
  },
})
