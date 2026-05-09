import { useSyncExternalStore } from 'react'
import type { AgentContextSnapshot } from '@agentronics/sdk'
import { useAgentronics } from './AgentronicsProvider.js'

/**
 * Subscribe to the live agent-context snapshot — class, trust level, vendor,
 * confidence, and any signals the detection engine has surfaced.
 *
 * Re-renders the calling component when any field changes. Backed by
 * `useSyncExternalStore` so it works under React 18+ Suspense and concurrent
 * rendering.
 *
 * @returns the current `AgentContextSnapshot` (never null — defaults to
 *   `{ class: null, trust: 'anonymous' }` before any detection completes).
 *
 * @example
 * ```tsx
 * const { class: agentClass, trust } = useAgentContext()
 * if (agentClass === 'webmcp' && trust === 'verified') {
 *   return <CheckoutButton />
 * }
 * ```
 */
export const useAgentContext = (): AgentContextSnapshot => {
  const client = useAgentronics()
  return useSyncExternalStore(
    (listener) => client.agentContext.subscribe(listener),
    () => client.agentContext.snapshot(),
    () => client.agentContext.snapshot()
  )
}
