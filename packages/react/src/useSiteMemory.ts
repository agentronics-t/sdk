import { useCallback, useSyncExternalStore } from 'react'
import type { SiteMemory } from '@agentronics/protocol'
import { useAgentronics } from './AgentronicsProvider.js'

const readPath = (snapshot: SiteMemory, path: string | undefined): unknown => {
  if (!path) return snapshot
  const parts = path.split('.').filter(Boolean)
  let cursor: unknown = snapshot
  for (const key of parts) {
    if (typeof cursor !== 'object' || cursor === null) return undefined
    cursor = (cursor as Record<string, unknown>)[key]
  }
  return cursor
}

/**
 * Read site memory reactively. Without arguments returns the full
 * `SiteMemory` snapshot; with a dot-path returns the value at that path
 * (typed as `T`). Re-renders when the underlying memory store changes.
 *
 * @example
 * ```tsx
 * const memory = useSiteMemory()                       // full snapshot
 * const cartCount = useSiteMemory<number>('cart.count') // dot-path lookup
 * const missing = useSiteMemory<string>('does.not.exist') // → undefined
 * ```
 *
 * @param path — optional dot-separated key path (e.g. `'user.preferences.theme'`).
 *   Empty / undefined returns the full snapshot.
 * @returns the value at `path`, or the full `SiteMemory` if no path is given.
 *   Returns `undefined` when the path doesn't resolve.
 */
export function useSiteMemory(): SiteMemory
export function useSiteMemory<T = unknown>(path: string): T | undefined
export function useSiteMemory<T = unknown>(path?: string): SiteMemory | T | undefined {
  const client = useAgentronics()
  const subscribe = useCallback(
    (listener: () => void) => client.siteMemory.subscribe(listener),
    [client]
  )
  const getSnapshot = useCallback(
    () => readPath(client.siteMemory.snapshot(), path),
    [client, path]
  )
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot) as
    | SiteMemory
    | T
    | undefined
}
