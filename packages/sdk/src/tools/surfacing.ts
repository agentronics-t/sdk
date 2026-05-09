import type { AgentIdentity, TrustLevel } from '@agentronics/protocol'
import { TRUST_RANK } from '@agentronics/protocol'
import type { GovernedTool } from './registry.js'

export interface SurfacingContext {
  identity: AgentIdentity | null
  stage?: string | null
  enabledStages?: string[]
}

export interface SurfacingDecision {
  tool: GovernedTool
  visible: boolean
  reason: string
}

const passesTrust = (tool: GovernedTool, identity: AgentIdentity | null): { ok: boolean; reason: string } => {
  const minTrust = tool.authz?.minTrust as TrustLevel | undefined
  if (!minTrust) return { ok: true, reason: 'no-trust-floor' }
  if (!identity) return { ok: false, reason: `requires-trust:${minTrust}` }
  if (TRUST_RANK[identity.trust] < TRUST_RANK[minTrust]) {
    return { ok: false, reason: `trust-too-low:${identity.trust}<${minTrust}` }
  }
  return { ok: true, reason: 'trust-ok' }
}

const passesClass = (tool: GovernedTool, identity: AgentIdentity | null): { ok: boolean; reason: string } => {
  const allowed = tool.authz?.allowedClasses ?? []
  if (allowed.length === 0) return { ok: true, reason: 'no-class-restriction' }
  if (!identity) return { ok: false, reason: `requires-class:${allowed.join('|')}` }
  if (!allowed.includes(identity.class)) {
    return { ok: false, reason: `class-not-allowed:${identity.class}` }
  }
  return { ok: true, reason: 'class-ok' }
}

const passesStage = (tool: GovernedTool, context: SurfacingContext): { ok: boolean; reason: string } => {
  if (!tool.stage) return { ok: true, reason: 'no-stage' }
  if (context.enabledStages && context.enabledStages.includes(tool.stage)) {
    return { ok: true, reason: `stage-enabled:${tool.stage}` }
  }
  if (context.stage === tool.stage) return { ok: true, reason: `stage-active:${tool.stage}` }
  return { ok: false, reason: `stage-locked:${tool.stage}` }
}

export const decideSurfacing = (
  tool: GovernedTool,
  context: SurfacingContext
): SurfacingDecision => {
  const trust = passesTrust(tool, context.identity)
  if (!trust.ok) return { tool, visible: false, reason: trust.reason }
  const cls = passesClass(tool, context.identity)
  if (!cls.ok) return { tool, visible: false, reason: cls.reason }
  const stage = passesStage(tool, context)
  if (!stage.ok) return { tool, visible: false, reason: stage.reason }
  if (tool.authz?.decision === 'deny') {
    return { tool, visible: false, reason: 'authz-deny' }
  }
  return { tool, visible: true, reason: 'visible' }
}

export const surfaceTools = (
  tools: GovernedTool[],
  context: SurfacingContext
): GovernedTool[] => tools.filter((tool) => decideSurfacing(tool, context).visible)

export const explainSurfacing = (
  tools: GovernedTool[],
  context: SurfacingContext
): SurfacingDecision[] => tools.map((tool) => decideSurfacing(tool, context))
