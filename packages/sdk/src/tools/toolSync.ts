import type { ToolDescriptor } from '@agentronics/protocol'
import type { GovernedTool } from './registry.js'

/**
 * Map a registered tool to the wire descriptor the gateway/dashboard consume.
 * `tokens` uses the same rough OpenAI-style rule of thumb the SDK's token
 * budget uses (≈ characters / 4) so the dashboard's per-tool cost matches.
 */
export const toToolDescriptor = (tool: GovernedTool): ToolDescriptor => {
  const descriptor: ToolDescriptor = {
    name: tool.name,
    description: tool.description ?? '',
    inputSchema: tool.inputSchema ?? {},
    tokens: 0,
  }
  if (tool.group) descriptor.group = tool.group
  if (tool.stage) descriptor.page = tool.stage
  if (tool.outputSchema) descriptor.outputSchema = tool.outputSchema
  descriptor.tokens = Math.ceil(
    JSON.stringify({
      name: descriptor.name,
      description: descriptor.description,
      inputSchema: descriptor.inputSchema,
      ...(descriptor.outputSchema ? { outputSchema: descriptor.outputSchema } : {}),
    }).length / 4
  )
  return descriptor
}

export interface ToolSyncOptions {
  gatewayUrl: string
  siteId: string
  publishableKey: string
  fetcher?: typeof fetch
}

/** Pushes the full tool registry to the gateway for dashboard display. */
export const createToolSync = ({
  gatewayUrl,
  siteId,
  publishableKey,
  fetcher = fetch,
}: ToolSyncOptions) => ({
  async push(tools: GovernedTool[]): Promise<number> {
    const descriptors = tools.map(toToolDescriptor)
    const response = await fetcher(
      `${gatewayUrl.replace(/\/$/, '')}/v1/sites/${encodeURIComponent(siteId)}/tools`,
      {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${publishableKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ registry: { tools: descriptors } }),
      }
    )
    if (!response.ok) {
      throw new Error(`Tool sync failed with status ${response.status}.`)
    }
    return descriptors.length
  },
})

export type ToolSync = ReturnType<typeof createToolSync>
