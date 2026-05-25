import { AgentClass, type AgentIdentity, type TrustLevel } from '@agentronics/protocol'
import { SDK_VERSION } from "../version.js"

export interface DeclareAgentInput {
  class: 'webmcp' | 'dom' | 'screenshot'
  vendor: string
  /** Optional bearer token returned by the customer's verification endpoint. */
  verificationToken?: string
}

export const declareAgent = (input: DeclareAgentInput): AgentIdentity => {
  const parsedClass = AgentClass.parse(input.class)
  const trust: TrustLevel = input.verificationToken ? 'verified' : 'declared'

  return {
    class: parsedClass,
    trust,
    confidence: 1,
    vendor: input.vendor,
    userAgent: typeof navigator === 'undefined' ? null : navigator.userAgent,
    detectionVersion: SDK_VERSION,
    signals: {
      declared: true,
      hasVerificationToken: Boolean(input.verificationToken),
    },
  }
}
