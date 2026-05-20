import 'server-only'
import type { TraceEvent } from '@agentronics/protocol'

/**
 * Builds a page → WebMCP-tools inventory from the trace stream. Tools are
 * grouped by `metadata.page` (stamped by SDK ≥ 0.1.2); traces from older SDKs
 * carry no page and fall into the `(unknown page)` bucket. See
 * mds/plan/20-5-26-work.md §5.
 */

export const UNKNOWN_PAGE = '(unknown page)'

const TOOL_TYPES = new Set<TraceEvent['type']>([
  'tool.registered',
  'tool.surfaced',
  'tool.executed',
])

export interface ToolRow {
  name: string
  group: string | null
  version: string | null
  stage: string | null
  state: 'enabled' | 'disabled'
  registrations: number
  executions: number
  blocked: number
  lastSeen: string
}

export interface PageToolInventory {
  page: string
  tools: ToolRow[]
  toolCount: number
  executions: number
  lastActivity: string
}

const readStr = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined

const newest = (events: TraceEvent[]): TraceEvent | undefined =>
  events.reduce<TraceEvent | undefined>((latest, event) => {
    if (!latest) return event
    return Date.parse(event.occurredAt) > Date.parse(latest.occurredAt) ? event : latest
  }, undefined)

const buildToolRow = (name: string, events: TraceEvent[]): ToolRow => {
  const registered = events.filter((e) => e.type === 'tool.registered')
  const surfaced = events.filter((e) => e.type === 'tool.surfaced')
  const executed = events.filter((e) => e.type === 'tool.executed')

  const latestRegistered = newest(registered)
  const latestSurfaced = newest(surfaced)
  const latestState = readStr(latestSurfaced?.metadata?.state)

  return {
    name,
    group: readStr(latestRegistered?.metadata?.group) ?? null,
    version: readStr(latestRegistered?.metadata?.version) ?? null,
    stage: readStr(latestRegistered?.metadata?.stage) ?? null,
    state: latestState === 'disabled' ? 'disabled' : 'enabled',
    registrations: registered.length,
    executions: executed.length,
    blocked: executed.filter((e) => e.outcome === 'blocked').length,
    lastSeen: newest(events)?.occurredAt ?? '',
  }
}

export const pagesWithTools = (events: TraceEvent[]): PageToolInventory[] => {
  const toolEvents = events.filter(
    (e): e is TraceEvent & { tool: string } => TOOL_TYPES.has(e.type) && Boolean(e.tool)
  )

  // page -> tool name -> events
  const byPage = new Map<string, Map<string, TraceEvent[]>>()
  for (const event of toolEvents) {
    const page = readStr(event.metadata?.page) ?? UNKNOWN_PAGE
    let tools = byPage.get(page)
    if (!tools) {
      tools = new Map()
      byPage.set(page, tools)
    }
    const list = tools.get(event.tool) ?? []
    list.push(event)
    tools.set(event.tool, list)
  }

  const inventory: PageToolInventory[] = [...byPage.entries()].map(([page, tools]) => {
    const rows = [...tools.entries()]
      .map(([name, evts]) => buildToolRow(name, evts))
      .sort((a, b) => a.name.localeCompare(b.name))
    return {
      page,
      tools: rows,
      toolCount: rows.length,
      executions: rows.reduce((sum, t) => sum + t.executions, 0),
      lastActivity: rows.reduce((latest, t) => (t.lastSeen > latest ? t.lastSeen : latest), ''),
    }
  })

  // Real pages first (most recently active on top), `(unknown page)` last.
  return inventory.sort((a, b) => {
    if (a.page === UNKNOWN_PAGE) return 1
    if (b.page === UNKNOWN_PAGE) return -1
    return b.lastActivity.localeCompare(a.lastActivity)
  })
}
