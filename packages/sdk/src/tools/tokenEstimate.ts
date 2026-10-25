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

/**
 * What an agent actually receives for a tool — the fields registered with
 * WebMCP (`name`, `title`, `description`, `inputSchema`, `annotations`).
 * Policy, version and grouping stay on the site and cost the agent nothing.
 */
export const modelFacingDescriptor = (tool: Pick<GovernedTool, 'name' | 'title' | 'description' | 'inputSchema' | 'annotations'>) => ({
  name: tool.name,
  ...(tool.title ? { title: tool.title } : {}),
  description: tool.description ?? tool.name,
  ...(tool.inputSchema ? { inputSchema: tool.inputSchema } : {}),
  ...(tool.annotations ? { annotations: tool.annotations } : {}),
})

/** ≈ characters / 4 of the model-facing descriptor. */
export const descriptorTokens = (tool: Parameters<typeof modelFacingDescriptor>[0]): number =>
  Math.ceil(stableStringify(modelFacingDescriptor(tool)).length / APPROX_CHARS_PER_TOKEN)

export const estimateToolTokens = (tool: GovernedTool): ToolTokenEstimate => {
  const characters = stableStringify(modelFacingDescriptor(tool)).length
  return { name: tool.name, characters, tokens: Math.ceil(characters / APPROX_CHARS_PER_TOKEN) }
}

export const estimateBudget = (tools: GovernedTool[]): TokenBudgetReport => {
  const perTool = tools.map(estimateToolTokens)
  const total = perTool.reduce((sum, entry) => sum + entry.tokens, 0)
  return { total, perTool }
}
