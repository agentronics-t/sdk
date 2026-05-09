import {
  PolicyRule,
  TRUST_RANK,
  type AgentIdentity,
  type PolicyDecision,
  type PolicyEvaluation,
  type PolicyRule as PolicyRuleType,
} from '@agentronics/protocol'
import { createRateLimiter, type RateLimiter } from './rateLimiter.js'

const matchTool = (pattern: string, tool: string): boolean => {
  if (pattern === '*' || pattern === tool) return true
  if (!pattern.includes('*')) return false
  const regex = new RegExp('^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$')
  return regex.test(tool)
}

const meetsTrust = (identity: AgentIdentity | null, rule: PolicyRuleType): boolean => {
  const have = identity ? TRUST_RANK[identity.trust] : -1
  const need = TRUST_RANK[rule.minTrust]
  return have >= need
}

const meetsClass = (identity: AgentIdentity | null, rule: PolicyRuleType): boolean => {
  if (rule.allowedClasses.length === 0) return true
  if (!identity) return false
  return rule.allowedClasses.includes(identity.class)
}

const DEFAULT_DECISION: PolicyDecision = 'review'

export interface EvaluateInput {
  tool: string
  identity: AgentIdentity | null
}

const rateLimitKey = (tool: string, identity: AgentIdentity | null): string => {
  const classPart = identity?.class ?? 'unknown'
  const vendorPart = identity?.vendor ?? 'unknown'
  const trustPart = identity?.trust ?? 'none'
  return `${tool}:${classPart}:${vendorPart}:${trustPart}`
}

export interface PolicyEngineOptions {
  rateLimiter?: RateLimiter
}

export const createPolicyEngine = (
  initial: PolicyRuleType[] = [],
  options: PolicyEngineOptions = {}
) => {
  let rules: PolicyRuleType[] = initial.map((rule) => PolicyRule.parse(rule))
  const rateLimiter = options.rateLimiter ?? createRateLimiter()

  return {
    set(next: PolicyRuleType[]) {
      rules = next.map((rule) => PolicyRule.parse(rule))
    },

    list(): PolicyRuleType[] {
      return [...rules]
    },

    evaluate({ tool, identity }: EvaluateInput): PolicyEvaluation {
      for (const rule of rules) {
        if (!matchTool(rule.tool, tool)) continue
        if (!meetsTrust(identity, rule)) {
          return {
            decision: 'deny',
            ruleId: rule.id,
            reason: `Rule "${rule.id}" requires trust >= ${rule.minTrust}.`,
          }
        }
        if (!meetsClass(identity, rule)) {
          return {
            decision: 'deny',
            ruleId: rule.id,
            reason: `Rule "${rule.id}" restricts to classes: ${rule.allowedClasses.join(', ')}.`,
          }
        }
        if (rule.rateLimit) {
          const rate = rateLimiter.consume(rateLimitKey(tool, identity), rule.rateLimit)
          if (!rate.allowed) {
            return {
              decision: 'deny',
              ruleId: rule.id,
              reason: `Rule "${rule.id}" rate limit exceeded. Resets at ${new Date(rate.resetAt).toISOString()}.`,
            }
          }
        }
        return {
          decision: rule.decision,
          ruleId: rule.id,
          reason: `Matched rule "${rule.id}".`,
        }
      }
      return {
        decision: DEFAULT_DECISION,
        ruleId: null,
        reason: `No rule matched tool "${tool}". Falling back to "${DEFAULT_DECISION}".`,
      }
    },
  }
}

export type PolicyEngine = ReturnType<typeof createPolicyEngine>
