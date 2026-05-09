import type { GovernedTool } from './registry.js'

const APPROX_CHARS_PER_TOKEN = 4

const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const keys = Object.keys(value as Record<string, unknown>).sort()
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
    .join(',')}}`
}

export interface ToolTokenEstimate {
  name: string
  characters: number
  tokens: number
}

export interface TokenBudgetReport {
  total: number
  perTool: ToolTokenEstimate[]
}

export const estimateToolTokens = (tool: GovernedTool): ToolTokenEstimate => {
  const descriptor = {
    name: tool.name,
    version: tool.version ?? null,
    group: tool.group ?? null,
    description: tool.description ?? null,
    inputSchema: tool.inputSchema ?? null,
    authz: tool.authz ?? null,
    rateLimit: tool.rateLimit ?? null,
  }
  const characters = stableStringify(descriptor).length
  return { name: tool.name, characters, tokens: Math.ceil(characters / APPROX_CHARS_PER_TOKEN) }
}

export const estimateBudget = (tools: GovernedTool[]): TokenBudgetReport => {
  const perTool = tools.map(estimateToolTokens)
  const total = perTool.reduce((sum, entry) => sum + entry.tokens, 0)
  return { total, perTool }
}
