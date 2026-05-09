import {
  IdentityClaim,
  type AgentIdentity,
  type IdentityClaim as IdentityClaimRecord,
} from '@agentronics/protocol'
import type { AuthMethod } from '../engine.js'

const identityFromClaim = (claim: IdentityClaimRecord): AgentIdentity => ({
  class: claim.class,
  trust: 'declared',
  confidence: 1,
  vendor: claim.vendor,
  userAgent: typeof navigator === 'undefined' ? null : navigator.userAgent,
  detectionVersion: '2026.04',
  signals: {
    declared: true,
    hasToken: true,
    tokenExpiresAt: claim.expiresAt ?? null,
  },
})

export const selfDeclaration = (): AuthMethod => ({
  name: 'selfDeclaration',
  async authenticate(input) {
    if (!input.declaration) return null
    return identityFromClaim(IdentityClaim.parse(input.declaration))
  },
})
