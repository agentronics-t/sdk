import type { GovernedTool } from './registry.js'

export const DEFAULT_GROUP = 'default'

export interface ToolGroupSummary {
  name: string
  tools: GovernedTool[]
}

export const groupTools = (tools: GovernedTool[]): ToolGroupSummary[] => {
  const map = new Map<string, GovernedTool[]>()
  for (const tool of tools) {
    const key = tool.group ?? DEFAULT_GROUP
    const bucket = map.get(key) ?? []
    bucket.push(tool)
    map.set(key, bucket)
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, list]) => ({ name, tools: list }))
}

export const listGroupNames = (tools: GovernedTool[]): string[] =>
  [...new Set(tools.map((tool) => tool.group ?? DEFAULT_GROUP))].sort()
