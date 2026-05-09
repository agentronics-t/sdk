import {
  AgentronicsError,
  IdentityClaim,
  isHigherTrust,
  type AgentIdentity,
  type IdentityClaim as IdentityClaimType,
} from '@agentronics/protocol'

export interface PresentIdentityOptions extends IdentityClaimType {
  /**
   * If false, accept the claim as `declared` (no remote verification).
   * If true, the claim is staged for the gateway to verify; trust is `declared` until then.
   */
  verifyRemotely?: boolean
}

export interface PresentedIdentity {
  identity: AgentIdentity
  claim: IdentityClaimType
}

const buildIdentity = (claim: IdentityClaimType): AgentIdentity => ({
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

export const createIdentityStore = () => {
  let presented: PresentedIdentity | null = null

  return {
    present(input: PresentIdentityOptions): PresentedIdentity {
      const parsed = IdentityClaim.safeParse(input)
      if (!parsed.success) {
        throw new AgentronicsError(
          'invalid_api_key',
          `Invalid identity claim: ${parsed.error.issues[0]?.message ?? 'unknown'}`
        )
      }
      const next: PresentedIdentity = {
        claim: parsed.data,
        identity: buildIdentity(parsed.data),
      }
      presented = next
      return next
    },

    clear() {
      presented = null
    },

    /** Return the presented identity if it outranks the supplied detection. */
    preferOver(detected: AgentIdentity | null): AgentIdentity | null {
      if (!presented) return detected
      if (!detected) return presented.identity
      return isHigherTrust(presented.identity.trust, detected.trust)
        ? presented.identity
        : detected
    },

    snapshot(): PresentedIdentity | null {
      return presented
    },
  }
}

export type IdentityStore = ReturnType<typeof createIdentityStore>
