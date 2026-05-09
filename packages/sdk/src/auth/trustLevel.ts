import { TRUST_RANK, type TrustLevel } from '@agentronics/protocol'

export interface TrustDerivationInput {
  detected?: boolean
  declared?: boolean
  verified?: boolean
  linked?: boolean
}

export const deriveTrustLevel = ({
  detected,
  declared,
  verified,
  linked,
}: TrustDerivationInput): TrustLevel => {
  if (linked) return 'linked'
  if (verified) return 'verified'
  if (declared) return 'declared'
  if (detected) return 'detected'
  return 'detected'
}

export const highestTrust = <T extends { trust: TrustLevel }>(identities: T[]): T | null => {
  let best: T | null = null
  for (const identity of identities) {
    if (!best || TRUST_RANK[identity.trust] > TRUST_RANK[best.trust]) best = identity
  }
  return best
}
