import type { MemoryScope } from '@agentronics/protocol'

export interface ScopeBackend {
  read(key: string): string | null
  write(key: string, value: string): void
  remove(key: string): void
  keys(): string[]
}

const inMemoryBackend = (): ScopeBackend => {
  const store = new Map<string, string>()
  return {
    read: (key) => store.get(key) ?? null,
    write: (key, value) => {
      store.set(key, value)
    },
    remove: (key) => {
      store.delete(key)
    },
    keys: () => [...store.keys()],
  }
}

const webStorageBackend = (storage: Storage, prefix: string): ScopeBackend => ({
  read: (key) => {
    try {
      return storage.getItem(prefix + key)
    } catch {
      return null
    }
  },
  write: (key, value) => {
    try {
      storage.setItem(prefix + key, value)
    } catch {
      // quota exceeded or storage disabled — fail silently, the in-memory fallback is acceptable
    }
  },
  remove: (key) => {
    try {
      storage.removeItem(prefix + key)
    } catch {
      // ignore
    }
  },
  keys: () => {
    const out: string[] = []
    try {
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i)
        if (k && k.startsWith(prefix)) out.push(k.slice(prefix.length))
      }
    } catch {
      // ignore
    }
    return out
  },
})

const PREFIX = 'agtx:'

export const createBackends = (): Record<MemoryScope, ScopeBackend> => {
  const hasWindow = typeof window !== 'undefined'
  const session =
    hasWindow && typeof window.sessionStorage !== 'undefined'
      ? webStorageBackend(window.sessionStorage, PREFIX + 'session:')
      : inMemoryBackend()
  const user =
    hasWindow && typeof window.localStorage !== 'undefined'
      ? webStorageBackend(window.localStorage, PREFIX + 'user:')
      : inMemoryBackend()
  return {
    session,
    user,
    org: inMemoryBackend(),
  }
}
