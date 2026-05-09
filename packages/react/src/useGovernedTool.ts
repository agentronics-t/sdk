import { useEffect } from 'react'
import type { GovernedTool } from '@agentronics/sdk'
import { useAgentronics } from './AgentronicsProvider.js'

/**
 * Register a governed tool with the Agentronics client for the lifetime of
 * the calling component. Returns nothing — the tool is unregistered on
 * unmount and re-registered whenever any value in `deps` changes.
 *
 * @param tool — the `GovernedTool` definition (id, version, group, authz,
 *   rateLimit, surfacing rules, plus the executor function).
 * @param deps — re-run registration when any value in this array changes.
 *   Empty by default, which means "register once on mount, unregister on
 *   unmount". Pass values that the executor closes over (e.g. cart state).
 *
 * @example
 * ```tsx
 * useGovernedTool({
 *   id: 'cart.add',
 *   group: 'commerce',
 *   authz: { minTrust: 'verified' },
 *   execute: ({ sku }) => addToCart(sku),
 * }, [addToCart])
 * ```
 */
export const useGovernedTool = (
  tool: GovernedTool,
  deps: ReadonlyArray<unknown> = []
): void => {
  const client = useAgentronics()
  useEffect(() => {
    const unregister = client.registerTool(tool)
    return unregister
    // `tool` is intentionally re-read each render but not in the dep array —
    // the caller signals re-registration intent through `deps`. Listing
    // `tool` would force re-registration on every render because consumers
    // typically pass an inline object literal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, ...deps])
}
