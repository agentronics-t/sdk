import { z } from 'zod'
import { AgentClass, TrustLevel } from './agent.js'

export const IdentityClaim = z.object({
  class: AgentClass,
  vendor: z.string().min(1),
  token: z.string().min(8),
  expiresAt: z.string().datetime().optional(),
})
export type IdentityClaim = z.infer<typeof IdentityClaim>

export const VerificationChallenge = z.object({
  publishableKey: z.string(),
  claim: IdentityClaim,
  nonce: z.string().min(8),
  origin: z.string().url(),
})
export type VerificationChallenge = z.infer<typeof VerificationChallenge>

export const VerificationResult = z.object({
  trust: TrustLevel,
  vendor: z.string(),
  validUntil: z.string().datetime(),
  reason: z.string().optional(),
})
export type VerificationResult = z.infer<typeof VerificationResult>

export const TRUST_RANK: Record<z.infer<typeof TrustLevel>, number> = {
  detected: 0,
  declared: 1,
  verified: 2,
  linked: 3,
}

export const isHigherTrust = (
  candidate: z.infer<typeof TrustLevel>,
  current: z.infer<typeof TrustLevel>
) => TRUST_RANK[candidate] > TRUST_RANK[current]
