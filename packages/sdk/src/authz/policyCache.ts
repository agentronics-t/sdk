import { PolicyRule, type PolicyRule as PolicyRuleRecord } from '@agentronics/protocol'

export interface PolicyCacheOptions {
  gatewayUrl: string
  siteId: string
  publishableKey: string
  fetcher?: typeof fetch
}

export interface PolicyCacheSnapshot {
  policies: PolicyRuleRecord[]
  etag: string | null
}

export const createPolicyCache = ({
  gatewayUrl,
  siteId,
  publishableKey,
  fetcher = fetch,
}: PolicyCacheOptions) => {
  let snapshot: PolicyCacheSnapshot = { policies: [], etag: null }

  return {
    snapshot(): PolicyCacheSnapshot {
      return {
        policies: [...snapshot.policies],
        etag: snapshot.etag,
      }
    },

    async sync(): Promise<PolicyCacheSnapshot> {
      const response = await fetcher(
        `${gatewayUrl.replace(/\/$/, '')}/v1/sites/${encodeURIComponent(siteId)}/policies`,
        {
          headers: {
            authorization: `Bearer ${publishableKey}`,
            ...(snapshot.etag ? { 'if-none-match': snapshot.etag } : {}),
          },
        }
      )
      if (response.status === 304) return this.snapshot()
      if (!response.ok) throw new Error(`Policy sync failed with status ${response.status}.`)

      const body = (await response.json()) as { policies?: unknown }
      const policies = PolicyRule.array().parse(body.policies ?? [])
      snapshot = {
        policies,
        etag: response.headers.get('etag'),
      }
      return this.snapshot()
    },
  }
}

export type PolicyCache = ReturnType<typeof createPolicyCache>
