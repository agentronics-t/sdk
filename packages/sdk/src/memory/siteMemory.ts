import {
  SITE_MEMORY_DEFAULT,
  SiteMemory as SiteMemorySchema,
  SiteMemoryPageContext,
  type SiteMemory,
} from '@agentronics/protocol'
import type { TraceInput } from '../observability/tracer.js'

export interface SiteMemoryStoreOptions {
  initial?: Partial<SiteMemory>
  onTrace?: (input: TraceInput) => void
}

export interface ProvideForPageInput {
  path: string
  payload: Record<string, unknown>
}

const cloneSiteMemory = (memory: SiteMemory): SiteMemory =>
  // Round-trip via the schema so callers always receive a validated, defaulted snapshot.
  SiteMemorySchema.parse(JSON.parse(JSON.stringify(memory)))

const stamp = (memory: SiteMemory): SiteMemory => ({
  ...memory,
  updatedAt: new Date().toISOString(),
})

export type SiteMemoryListener = (snapshot: SiteMemory) => void

export const createSiteMemoryStore = (options: SiteMemoryStoreOptions = {}) => {
  let state: SiteMemory = SiteMemorySchema.parse({
    ...SITE_MEMORY_DEFAULT,
    ...(options.initial ?? {}),
  })
  let cachedSnapshot: SiteMemory | null = null
  const listeners = new Set<SiteMemoryListener>()
  const emit = (input: TraceInput) => {
    options.onTrace?.(input)
  }
  const invalidate = () => {
    cachedSnapshot = null
  }
  const notify = () => {
    if (listeners.size === 0) return
    const snap = cloneSiteMemory(state)
    cachedSnapshot = snap
    listeners.forEach((listener) => listener(snap))
  }

  const provide = (next: Partial<SiteMemory>): SiteMemory => {
    const merged = SiteMemorySchema.parse({
      ...state,
      ...next,
      // Workflows/policies/uiGuidance/pageContexts merge by key so partial provides do not nuke siblings.
      workflows: { ...state.workflows, ...(next.workflows ?? {}) },
      policies: { ...state.policies, ...(next.policies ?? {}) },
      uiGuidance: { ...state.uiGuidance, ...(next.uiGuidance ?? {}) },
      pageContexts: { ...state.pageContexts, ...(next.pageContexts ?? {}) },
    })
    state = stamp(merged)
    invalidate()
    emit({
      type: 'memory.updated',
      metadata: { kind: 'site', operation: 'provide', keys: Object.keys(next) },
    })
    notify()
    return snapshot()
  }

  const update = (path: string, value: unknown): SiteMemory => {
    const parts = path.split('.').filter(Boolean)
    if (parts.length === 0) {
      throw new Error('siteMemory.update() requires a non-empty dot-path.')
    }
    const next = JSON.parse(JSON.stringify(state)) as Record<string, unknown>
    let cursor: Record<string, unknown> = next
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts[i]!
      const existing = cursor[key]
      if (typeof existing !== 'object' || existing === null || Array.isArray(existing)) {
        cursor[key] = {}
      }
      cursor = cursor[key] as Record<string, unknown>
    }
    cursor[parts[parts.length - 1]!] = value
    state = stamp(SiteMemorySchema.parse(next))
    invalidate()
    emit({ type: 'memory.updated', metadata: { kind: 'site', operation: 'update', path } })
    notify()
    return snapshot()
  }

  const provideForPage = (input: ProvideForPageInput): SiteMemoryPageContext => {
    const context = SiteMemoryPageContext.parse({
      path: input.path,
      payload: input.payload,
      updatedAt: new Date().toISOString(),
    })
    state = stamp({
      ...state,
      pageContexts: { ...state.pageContexts, [input.path]: context },
    })
    invalidate()
    emit({
      type: 'memory.updated',
      metadata: { kind: 'site', operation: 'provideForPage', path: input.path },
    })
    notify()
    return { ...context, payload: { ...context.payload } }
  }

  const snapshot = (): SiteMemory => {
    if (!cachedSnapshot) cachedSnapshot = cloneSiteMemory(state)
    return cachedSnapshot
  }

  const get = (path?: string): unknown => {
    emit({
      type: 'memory.accessed',
      metadata: { kind: 'site', operation: path ? 'get' : 'snapshot', path: path ?? null },
    })
    if (!path) return cloneSiteMemory(state)
    const parts = path.split('.').filter(Boolean)
    let cursor: unknown = state
    for (const key of parts) {
      if (typeof cursor !== 'object' || cursor === null) return undefined
      cursor = (cursor as Record<string, unknown>)[key]
    }
    return cursor
  }

  const getForPage = (path: string): SiteMemoryPageContext | null => {
    emit({
      type: 'memory.accessed',
      metadata: { kind: 'site', operation: 'getForPage', path },
    })
    const found = state.pageContexts[path]
    return found ? { ...found, payload: { ...found.payload } } : null
  }

  const replace = (next: SiteMemory): SiteMemory => {
    state = stamp(SiteMemorySchema.parse(next))
    invalidate()
    notify()
    return snapshot()
  }

  const subscribe = (listener: SiteMemoryListener): (() => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  return { provide, update, provideForPage, snapshot, get, getForPage, replace, subscribe }
}

export type SiteMemoryStore = ReturnType<typeof createSiteMemoryStore>
