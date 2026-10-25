import { AgentClass } from '@agentronics/protocol'
import { SDK_VERSION } from "../../version.js"
import type { AuthMethod } from '../engine.js'

export const xAgentHeader = (): AuthMethod => ({
  name: 'xAgentHeader',
  async authenticate(input) {
    if (!input.xAgentHeader) return null
    const [vendor = 'x-agent', rawClass = 'dom', proof] = input.xAgentHeader.split(';')
    const parsedClass = AgentClass.safeParse(rawClass)

    return {
      class: parsedClass.success ? parsedClass.data : 'dom',
      // The proof segment is not checked client-side, so the header is a claim.
      trust: 'declared',
      confidence: proof ? 1 : 0.8,
      vendor,
      userAgent: typeof navigator === 'undefined' ? null : navigator.userAgent,
      detectionVersion: SDK_VERSION,
      signals: { xAgentHeader: true, hasProof: Boolean(proof) },
    }
  },
})
