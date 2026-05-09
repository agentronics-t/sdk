import { MemoryEntry, type MemoryScope } from '@agentronics/protocol'
import type { TraceInput } from '../observability/tracer.js'
import { createBackends, type ScopeBackend } from './storage.js'

interface StoredRecord {
  value: unknown
  expiresAt: number | null
  updatedAt: string
}

const isExpired = (record: StoredRecord, now: number): boolean =>
  record.expiresAt !== null && record.expiresAt <= now

const decode = (raw: string | null): StoredRecord | null => {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as StoredRecord
    if (typeof parsed !== 'object' || parsed === null) return null
    return parsed
  } catch {
    return null
  }
}

const encode = (record: StoredRecord): string => JSON.stringify(record)

export interface MemoryGetOptions {
  scope?: MemoryScope
}

export interface MemorySetOptions {
  scope?: MemoryScope
  ttlSeconds?: number
}

export interface MemoryStoreOptions {
  onTrace?: (input: TraceInput) => void
}

export const createMemoryStore = (options: MemoryStoreOptions = {}) => {
  const backends: Record<MemoryScope, ScopeBackend> = createBackends()
  const emit = (input: TraceInput) => {
    options.onTrace?.(input)
  }

  const get = (key: string, options: MemoryGetOptions = {}): unknown => {
    const scope = options.scope ?? 'session'
    const backend = backends[scope]
    const record = decode(backend.read(key))
    if (!record) {
      emit({ type: 'memory.accessed', metadata: { operation: 'get', key, scope, hit: false } })
      return undefined
    }
    if (isExpired(record, Date.now())) {
      backend.remove(key)
      emit({ type: 'memory.accessed', metadata: { operation: 'get', key, scope, hit: false, expired: true } })
      return undefined
    }
    emit({ type: 'memory.accessed', metadata: { operation: 'get', key, scope, hit: true } })
    return record.value
  }

  const set = (key: string, value: unknown, options: MemorySetOptions = {}): MemoryEntry => {
    const scope = options.scope ?? 'session'
    const ttl = options.ttlSeconds ?? null
    const now = Date.now()
    const record: StoredRecord = {
      value,
      expiresAt: ttl === null ? null : now + ttl * 1000,
      updatedAt: new Date(now).toISOString(),
    }
    backends[scope].write(key, encode(record))
    emit({ type: 'memory.updated', metadata: { operation: 'set', key, scope, ttlSeconds: ttl } })
    return MemoryEntry.parse({
      key,
      value,
      scope,
      ttlSeconds: ttl,
      updatedAt: record.updatedAt,
    })
  }

  const remove = (key: string, options: MemoryGetOptions = {}) => {
    const scope = options.scope ?? 'session'
    backends[scope].remove(key)
    emit({ type: 'memory.updated', metadata: { operation: 'remove', key, scope } })
  }

  const list = (options: MemoryGetOptions = {}): MemoryEntry[] => {
    const scope = options.scope ?? 'session'
    const backend = backends[scope]
    const now = Date.now()
    const out: MemoryEntry[] = []
    for (const key of backend.keys()) {
      const record = decode(backend.read(key))
      if (!record) continue
      if (isExpired(record, now)) {
        backend.remove(key)
        continue
      }
      out.push(
        MemoryEntry.parse({
          key,
          value: record.value,
          scope,
          ttlSeconds:
            record.expiresAt === null ? null : Math.max(0, Math.round((record.expiresAt - now) / 1000)),
          updatedAt: record.updatedAt,
        })
      )
    }
    emit({ type: 'memory.accessed', metadata: { operation: 'list', scope, count: out.length } })
    return out
  }

  const clear = (options: MemoryGetOptions = {}) => {
    const scope = options.scope ?? 'session'
    const backend = backends[scope]
    const count = backend.keys().length
    for (const key of backend.keys()) backend.remove(key)
    emit({ type: 'memory.updated', metadata: { operation: 'clear', scope, count } })
  }

  return { get, set, remove, list, clear }
}

export type MemoryStore = ReturnType<typeof createMemoryStore>
