import type { TraceBatch, TraceEvent as TraceEventRecord } from '@agentronics/protocol'
import type { TraceExporter } from '../tracer.js'
import type { GovernedTool } from '../../tools/registry.js'
import { toToolDescriptor } from '../../tools/toolSync.js'

export interface IntelExporterOptions {
  /**
   * Intelligence API base URL (e.g. `https://intel-api-….run.app`) — the
   * `/v1/sdk/events` path is appended automatically — or the full ingest URL.
   */
  url: string
  /**
   * Per-tenant SDK ingest key (`agtx_ik_…`), minted in the dashboard Settings.
   * This is a **secret**: use this exporter in your backend only, never in the
   * browser. (The browser SDK should forward traces to your backend, which
   * relays them with the key.)
   */
  ingestKey: string
  fetcher?: typeof fetch
}

const INGEST_PATH = '/v1/sdk/events'

/**
 * Stream governed-action traces to the Agentronics Intelligence dashboard.
 * POSTs a `TraceBatch` to the intel-api ingest endpoint with the ingest key.
 * Intended for Node/server use (the existing webhook exporter is browser-bound
 * and can't send an auth header).
 */
export const createIntelExporter = ({
  url,
  ingestKey,
  fetcher = fetch,
}: IntelExporterOptions): TraceExporter => {
  const base = url.replace(/\/$/, '')
  const endpoint = base.endsWith(INGEST_PATH) ? base : `${base}${INGEST_PATH}`
  return {
    name: 'intel',
    async export(events: TraceEventRecord[]) {
      const batch: TraceBatch = { events }
      const response = await fetcher(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${ingestKey}`,
        },
        body: JSON.stringify(batch),
      })
      if (!response.ok) {
        throw new Error(`Intel exporter failed with status ${response.status}.`)
      }
    },
  }
}

export interface IntelSyncOptions {
  /** Intelligence API base URL (e.g. `https://intel-api-….run.app`). */
  url: string
  /** Per-tenant SDK ingest key (`agtx_ik_…`). Backend-only — never the browser. */
  ingestKey: string
  /** The site these tools/memory belong to (matches your SDK `siteId`). */
  siteId: string
  fetcher?: typeof fetch
}

/**
 * Push the authoritative tool registry + site-memory snapshot to the
 * Intelligence dashboard — the full data the WebMCP Tools + Knaph pages need,
 * which is too large for the lightweight trace stream. Call after `syncTools()`
 * / `provideSiteMemory(...)`. Backend/server use only (the key is secret).
 */
export interface IntelSync {
  /** POST the registry to /v1/sdk/tools. Returns the number of tools sent. */
  pushTools(tools: GovernedTool[]): Promise<number>
  /** POST the site-memory snapshot (+ optional quality score) to /v1/sdk/memory. */
  pushMemory(snapshot: object, score?: number): Promise<void>
}

export const createIntelSync = ({
  url,
  ingestKey,
  siteId,
  fetcher = fetch,
}: IntelSyncOptions): IntelSync => {
  const base = url.replace(/\/$/, '')
  const post = async (path: string, body: unknown): Promise<void> => {
    const response = await fetcher(`${base}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${ingestKey}`,
      },
      body: JSON.stringify(body),
    })
    if (!response.ok) {
      throw new Error(`Intel sync ${path} failed with status ${response.status}.`)
    }
  }

  return {
    async pushTools(tools: GovernedTool[]) {
      const descriptors = tools.map(toToolDescriptor)
      await post('/v1/sdk/tools', { siteId, tools: descriptors })
      return descriptors.length
    },
    async pushMemory(snapshot: object, score?: number) {
      await post('/v1/sdk/memory', {
        siteId,
        snapshot,
        ...(typeof score === 'number' ? { score } : {}),
      })
    },
  }
}
