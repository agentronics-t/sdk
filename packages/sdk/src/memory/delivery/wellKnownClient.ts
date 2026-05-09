import { SiteMemory as SiteMemorySchema, type SiteMemory } from '@agentronics/protocol'

export const WELL_KNOWN_PATH = '/.well-known/agent-context.json'

export interface WellKnownClientOptions {
  origin?: string
  fetcher?: typeof fetch
  signal?: AbortSignal
}

export const fetchWellKnownContext = async ({
  origin,
  fetcher = fetch,
  signal,
}: WellKnownClientOptions = {}): Promise<SiteMemory | null> => {
  const target =
    (origin ? origin.replace(/\/$/, '') : typeof window !== 'undefined' ? window.location.origin : '') +
    WELL_KNOWN_PATH
  if (!target.startsWith('http')) {
    return null
  }
  const fetchInit: RequestInit = { headers: { accept: 'application/json' } }
  if (signal !== undefined) fetchInit.signal = signal
  const response = await fetcher(target, fetchInit)
  if (!response.ok) {
    if (response.status === 404) return null
    throw new Error(`well-known agent-context fetch failed with status ${response.status}.`)
  }
  const payload = (await response.json()) as unknown
  return SiteMemorySchema.parse(payload)
}

export interface ServeWellKnownOptions {
  snapshot: SiteMemory
}

/**
 * Returns a JSON string suitable for /.well-known/agent-context.json. Hosts proxy this
 * through their CDN/edge so any agent can fetch it with no SDK installed.
 */
export const serializeWellKnownContext = ({ snapshot }: ServeWellKnownOptions): string =>
  JSON.stringify(SiteMemorySchema.parse(snapshot))
