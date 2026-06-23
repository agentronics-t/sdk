import type { TraceBatch, TraceEvent as TraceEventRecord } from '@agentronics/protocol'
import type { TraceExporter } from '../tracer.js'

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
