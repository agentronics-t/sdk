import { SiteMemory as SiteMemorySchema, type SiteMemory } from '@agentronics/protocol'

export interface MemoryCacheOptions {
  gatewayUrl: string
  siteId: string
  publishableKey: string
  fetcher?: typeof fetch
}

export interface MemoryCacheSnapshot {
  memory: SiteMemory | null
  etag: string | null
}

export const createMemoryCache = ({
  gatewayUrl,
  siteId,
  publishableKey,
  fetcher = fetch,
}: MemoryCacheOptions) => {
  let snapshot: MemoryCacheSnapshot = { memory: null, etag: null }

  return {
    snapshot(): MemoryCacheSnapshot {
      return {
        memory: snapshot.memory ? SiteMemorySchema.parse(snapshot.memory) : null,
        etag: snapshot.etag,
      }
    },

    async sync(): Promise<MemoryCacheSnapshot> {
      const response = await fetcher(
        `${gatewayUrl.replace(/\/$/, '')}/v1/sites/${encodeURIComponent(siteId)}/memory`,
        {
          headers: {
            authorization: `Bearer ${publishableKey}`,
            ...(snapshot.etag ? { 'if-none-match': snapshot.etag } : {}),
          },
        }
      )
      if (response.status === 304) return this.snapshot()
      if (!response.ok) throw new Error(`Memory sync failed with status ${response.status}.`)

      const body = (await response.json()) as { memory?: unknown }
      const memory = SiteMemorySchema.parse(body.memory ?? {})
      snapshot = {
        memory,
        etag: response.headers.get('etag'),
      }
      return this.snapshot()
    },
  }
}

export type MemoryCache = ReturnType<typeof createMemoryCache>
