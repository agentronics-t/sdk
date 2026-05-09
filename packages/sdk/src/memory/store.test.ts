import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryStore } from './store.js'

describe('memory store', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    window.localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('round-trips a value in session scope', () => {
    const memory = createMemoryStore()
    memory.set('cart', { items: 2 })
    expect(memory.get('cart')).toEqual({ items: 2 })
  })

  it('persists user-scope values into localStorage', () => {
    const memory = createMemoryStore()
    memory.set('preferences', { dark: true }, { scope: 'user' })
    const raw = window.localStorage.getItem('agtx:user:preferences')
    expect(raw).toContain('"dark":true')
  })

  it('keeps session and user scopes isolated', () => {
    const memory = createMemoryStore()
    memory.set('k', 'session-v', { scope: 'session' })
    memory.set('k', 'user-v', { scope: 'user' })
    expect(memory.get('k', { scope: 'session' })).toBe('session-v')
    expect(memory.get('k', { scope: 'user' })).toBe('user-v')
  })

  it('expires values after their TTL', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const memory = createMemoryStore()
    memory.set('temp', 'soon-gone', { ttlSeconds: 60 })
    expect(memory.get('temp')).toBe('soon-gone')
    vi.setSystemTime(new Date('2026-01-01T00:02:00Z'))
    expect(memory.get('temp')).toBeUndefined()
  })

  it('list() returns all live entries with remaining TTL', () => {
    const memory = createMemoryStore()
    memory.set('a', 1)
    memory.set('b', 2, { ttlSeconds: 3600 })
    const entries = memory.list()
    expect(entries).toHaveLength(2)
    const b = entries.find((e) => e.key === 'b')!
    expect(b.ttlSeconds).toBeGreaterThan(0)
    expect(b.ttlSeconds).toBeLessThanOrEqual(3600)
  })

  it('remove() and clear() drop entries', () => {
    const memory = createMemoryStore()
    memory.set('a', 1)
    memory.set('b', 2)
    memory.remove('a')
    expect(memory.get('a')).toBeUndefined()
    expect(memory.get('b')).toBe(2)
    memory.clear()
    expect(memory.list()).toHaveLength(0)
  })

  it('survives JSON-unparseable raw values without crashing', () => {
    window.sessionStorage.setItem('agtx:session:corrupt', '{not json')
    const memory = createMemoryStore()
    expect(memory.get('corrupt')).toBeUndefined()
  })
})
