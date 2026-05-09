import { z } from 'zod'
import { AgentIdentity } from './agent.js'
import { PolicyEvaluation } from './policy.js'

export const TraceEventType = z.enum([
  'agent.detected',
  'agent.missed',
  'auth.identity_presented',
  'auth.identity_cleared',
  'authz.policies_set',
  'authz.evaluated',
  'memory.accessed',
  'memory.updated',
  'tool.registered',
  'tool.executed',
  'tool.surfaced',
  'tool.progressed',
  'sdk.error',
])
export type TraceEventType = z.infer<typeof TraceEventType>

export const TraceEvent = z.object({
  id: z.string(),
  siteId: z.string(),
  sessionId: z.string(),
  occurredAt: z.string().datetime(),
  type: TraceEventType,
  tool: z.string().optional(),
  agent: AgentIdentity.nullable().optional(),
  policy: PolicyEvaluation.optional(),
  durationMs: z.number().int().nonnegative().optional(),
  outcome: z.enum(['success', 'error', 'blocked']),
  error: z.string().optional(),
  metadata: z.record(z.unknown()).default({}),
})
export type TraceEvent = z.infer<typeof TraceEvent>

export const TraceBatch = z.object({
  publishableKey: z.string(),
  events: z.array(TraceEvent).min(1).max(100),
})
export type TraceBatch = z.infer<typeof TraceBatch>
