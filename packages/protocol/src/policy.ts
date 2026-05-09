import { z } from 'zod'
import { AgentClass, TrustLevel } from './agent.js'

export const PolicyDecision = z.enum(['allow', 'deny', 'review'])
export type PolicyDecision = z.infer<typeof PolicyDecision>

export const PolicyRule = z.object({
  id: z.string(),
  tool: z.string(),
  minTrust: TrustLevel,
  allowedClasses: z.array(AgentClass).default([]),
  decision: PolicyDecision,
  rateLimit: z
    .object({
      max: z.number().int().positive(),
      windowSeconds: z.number().int().positive(),
    })
    .optional(),
})
export type PolicyRule = z.infer<typeof PolicyRule>

export const PolicyEvaluation = z.object({
  decision: PolicyDecision,
  ruleId: z.string().nullable(),
  reason: z.string(),
})
export type PolicyEvaluation = z.infer<typeof PolicyEvaluation>
