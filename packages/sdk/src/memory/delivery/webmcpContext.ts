import type { SiteMemory } from '@agentronics/protocol'

export interface WebMcpContextTool {
  name: string
  description: string
  inputSchema: { type: 'object'; properties: Record<string, unknown>; required: string[] }
  invoke(input?: { path?: string }): { content: SiteMemory | unknown }
}

export interface WebMcpContextOptions {
  toolName?: string
  description?: string
  getSnapshot: () => SiteMemory
  onAccess?: (path: string | null) => void
}

export const createWebMcpContextTool = ({
  toolName = 'getSiteContext',
  description = 'Returns Agentronics site memory: page map, workflows, policies, UI guidance.',
  getSnapshot,
  onAccess,
}: WebMcpContextOptions): WebMcpContextTool => ({
  name: toolName,
  description,
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Optional dot-path into the site memory (e.g. "workflows.purchase").',
      },
    },
    required: [],
  },
  invoke(input = {}) {
    const snapshot = getSnapshot()
    const path = input.path ?? null
    onAccess?.(path)
    if (!path) return { content: snapshot }
    const parts = path.split('.').filter(Boolean)
    let cursor: unknown = snapshot
    for (const key of parts) {
      if (typeof cursor !== 'object' || cursor === null) return { content: undefined }
      cursor = (cursor as Record<string, unknown>)[key]
    }
    return { content: cursor }
  },
})
