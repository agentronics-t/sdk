import type { TraceBatch, TraceEvent as TraceEventRecord } from '@agentronics/protocol'
import type { TraceExporter } from '../tracer.js'

export interface GatewayExporterOptions {
  gatewayUrl: string
  publishableKey: string
  fetcher?: typeof fetch
}

export const createGatewayExporter = ({
  gatewayUrl,
  publishableKey,
  fetcher = fetch,
}: GatewayExporterOptions): TraceExporter => ({
  name: 'gateway',
  async export(events: TraceEventRecord[]) {
    const batch: TraceBatch = { publishableKey, events }
    await fetcher(`${gatewayUrl.replace(/\/$/, '')}/v1/traces`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${publishableKey}`,
      },
      body: JSON.stringify(batch),
    })
  },
})
