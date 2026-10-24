import type { ToolDescriptor } from '@agentronics/protocol'
import type { GovernedTool } from './registry.js'
import { descriptorTokens } from './tokenEstimate.js'

/**
 * Map a registered tool to the wire descriptor the gateway/dashboard consume.
 * `tokens` is the SDK's estimate (≈ characters / 4) of the model-facing
 * descriptor, so the console's per-tool cost matches `estimateTokens()`.
 */
export const toToolDescriptor = (tool: GovernedTool): ToolDescriptor => {
  const descriptor: ToolDescriptor = {
    name: tool.name,
    description: tool.description ?? '',
    inputSchema: tool.inputSchema ?? {},
    tokens: 0,
  }
  if (tool.title) descriptor.title = tool.title
  if (tool.annotations) descriptor.annotations = { ...tool.annotations } as Record<string, boolean>
  if (tool.group) descriptor.group = tool.group
  if (tool.stage) descriptor.page = tool.stage
  if (tool.outputSchema) descriptor.outputSchema = tool.outputSchema
  // Same count the browser reports: what agents receive (output schemas aren't sent).
  descriptor.tokens = descriptorTokens(tool)
  return descriptor
}

export interface ToolSyncOptions {
  gatewayUrl: string
  siteId: string
  publishableKey: string
  fetcher?: typeof fetch
}

/** Pushes the full tool registry to the Agentronics API (publishable key; the key's allowed origins only). */
export const createToolSync = ({
  gatewayUrl,
  siteId,
  publishableKey,
  fetcher = fetch,
}: ToolSyncOptions) => ({
  async push(tools: GovernedTool[]): Promise<number> {
    const descriptors = tools.map(toToolDescriptor)
    const response = await fetcher(
      `${gatewayUrl.replace(/\/$/, '')}/v1/pub/sites/${encodeURIComponent(siteId)}/tools`,
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
