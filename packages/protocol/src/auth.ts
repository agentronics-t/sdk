import { z } from 'zod'
import { AgentClass, TrustLevel } from './agent.js'

export const AuthProtocol = z.enum([
  'bearer',
  'oauth2',
  'sso',
  'spiffe',
  'google-agent',
  'mtls',
  'detection',
  'declaration',
  'extension',
  'session-link',
  'x-agent-header',
])
export type AuthProtocol = z.infer<typeof AuthProtocol>

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
  // Canonical principal returned by the verifier (OIDC sub, SPIFFE ID,
  // cert subject). Optional so existing verifiers keep compiling.
  subject: z.string().optional(),
  // Which protocol the gateway actually verified against. Lets the SDK
  // route SPIFFE → 'google-agent' trace labels when the trust domain
  // matches a Google enrichment match.
  protocol: AuthProtocol.optional(),
  // Free-form per-protocol enrichment (e.g. google agent_id, SPIFFE
  // trust domain). Lifted into AgentIdentity.signals at trace time.
  signals: z.record(z.unknown()).optional(),
})
export type VerificationResult = z.infer<typeof VerificationResult>

// Per-site verifier config — shared with the dashboard so it can validate
// forms before submitting and so the gateway accepts only well-formed
// PUTs. These mirror the `*Config` interfaces in
// packages/gateway/src/storage/types.ts but live here because the
// dashboard already imports from @agentronics/protocol.
export const SsoConfigInput = z.object({
  issuer: z.string().url(),
  audiences: z.array(z.string().min(1)).min(1),
})
export type SsoConfigInput = z.infer<typeof SsoConfigInput>

export const SpiffeConfigInput = z.object({
  trustDomain: z.string().min(1),
  bundleEndpoint: z.string().url(),
  audiences: z.array(z.string().min(1)).min(1),
  googleTrustDomains: z.array(z.string().min(1)).optional(),
})
export type SpiffeConfigInput = z.infer<typeof SpiffeConfigInput>

export const MtlsConfigInput = z.object({
  // PEM blocks are >20 chars even when empty-bodied; rejects obvious junk.
  rootCerts: z.array(z.string().min(20)).min(1),
  spiffeTrustDomain: z.string().min(1).optional(),
  xfccEntryPolicy: z.enum(['last', 'first', 'only']).default('last'),
})
export type MtlsConfigInput = z.infer<typeof MtlsConfigInput>

export const SiteProtocolName = z.enum(['sso', 'spiffe', 'mtls'])
export type SiteProtocolName = z.infer<typeof SiteProtocolName>

// Body shape for POST /v1/verify/:protocol. Authentication is via the
// standard Authorization: Bearer <publishable_or_secret_key> header
// (same middleware as the other authenticated routes). The protocol
// comes from the URL param. `token` carries JWT-shaped creds (OIDC ID
// tokens, SPIFFE JWT-SVIDs, Google agent tokens). `xfcc` carries the
// raw x-forwarded-client-cert header for mTLS verification. Exactly one
// of `token` or `xfcc` is required; the route handler enforces per
// protocol. `siteId` selects which per-site verifier config to load.
export const VerificationRequest = z.object({
  siteId: z.string().min(1),
  token: z.string().min(8).optional(),
  xfcc: z.string().min(1).optional(),
  headers: z.record(z.string()).optional(),
  origin: z.string().url().optional(),
})
export type VerificationRequest = z.infer<typeof VerificationRequest>

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
