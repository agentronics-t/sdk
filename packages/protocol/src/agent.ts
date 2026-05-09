import { z } from 'zod'

export const AgentClass = z.enum(['webmcp', 'dom', 'screenshot'])
export type AgentClass = z.infer<typeof AgentClass>

export const TrustLevel = z.enum(['detected', 'declared', 'verified', 'linked'])
export type TrustLevel = z.infer<typeof TrustLevel>

export const AgentIdentity = z.object({
  class: AgentClass,
  trust: TrustLevel,
  confidence: z.number().min(0).max(1).default(1),
  vendor: z.string().nullable(),
  userAgent: z.string().nullable(),
  detectionVersion: z.string().default('2026.04'),
  signals: z.record(z.unknown()).default({}),
})
export type AgentIdentity = z.infer<typeof AgentIdentity>
