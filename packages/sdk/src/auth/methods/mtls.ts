import type { AuthMethod } from '../engine.js'
import { SDK_VERSION } from "../../version.js"

// mTLS via x-forwarded-client-cert (XFCC). Browser builds never trigger
// this — JavaScript cannot inspect its own TLS state. Node companions
// forward the XFCC header value verbatim and the gateway parses + chain-
// validates against the site's registered roots (D2 policy applies for
// multi-entry headers). If the XFCC URI SAN carries a `spiffe://` value
// it is lifted into `signals.spiffeId` so dashboard pivots can correlate
// X.509-SVID traffic with JWT-SVID traffic from the same workload.
export const mtls = (): AuthMethod => ({
  name: 'mtls',
  async authenticate(input, context) {
    if (!input.xfccHeader) return null
    const verified = await context.verifyToken?.('mtls', input.xfccHeader)
    return {
      class: input.classHint ?? 'webmcp',
      trust: verified?.trust ?? 'verified',
      confidence: 1,
      vendor: verified?.vendor ?? input.vendorHint ?? 'mtls',
      userAgent: typeof navigator === 'undefined' ? null : navigator.userAgent,
      detectionVersion: SDK_VERSION,
      signals: {
        mtls: true,
        subject: verified?.subject ?? null,
        verifiedRemotely: Boolean(verified),
        ...(verified?.signals ?? {}),
      },
    }
  },
})
