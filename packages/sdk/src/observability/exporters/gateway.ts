import type { TraceBatch, TraceEvent as TraceEventRecord } from '@agentronics/protocol'
import type { TraceExporter } from '../tracer.js'

export interface GatewayExporterOptions {
  gatewayUrl: string
  publishableKey: string
  fetcher?: typeof fetch
  /** Send queued events this often (ms). Default 2000. */
  flushMs?: number
  /** Events per request; the API accepts at most 100. Default 50. */
  maxBatch?: number
  /** Events kept while the API is unreachable; the oldest are dropped first. Default 500. */
  maxQueue?: number
}

export interface GatewayExporter extends TraceExporter {
  /** Send everything queued now (`keepalive` lets it outlive the page); settles when the requests do. */
  flush(keepalive?: boolean): Promise<void>
}

/**
 * Sends traces to the Agentronics API from the browser. Events are queued and
 * sent in batches — every couple of seconds, when a batch fills, and when the
 * page is hidden or closed — rather than one request per event, so a busy page
 * stays within the API's per-visitor rate limit. Never throws into the page:
 * a failed send drops that batch.
 */
export const createGatewayExporter = ({
  gatewayUrl,
  publishableKey,
  fetcher,
  flushMs = 2000,
  maxBatch = 50,
  maxQueue = 500,
}: GatewayExporterOptions): GatewayExporter => {
  const url = `${gatewayUrl.replace(/\/$/, '')}/v1/pub/traces`
  const batchSize = Math.max(1, Math.min(100, maxBatch))
  let queue: TraceEventRecord[] = []
  let timer: ReturnType<typeof setTimeout> | null = null

  const send = (events: TraceEventRecord[], keepalive: boolean): Promise<void> => {
    const doFetch = fetcher ?? (typeof fetch === 'function' ? fetch : null)
    if (!doFetch) return Promise.resolve()
    const batch: TraceBatch = { publishableKey, events }
    try {
      return Promise.resolve(
        doFetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${publishableKey}` },
          body: JSON.stringify(batch),
          ...(keepalive ? { keepalive: true } : {}),
        }),
      ).then(
        () => undefined,
        () => undefined,
      )
    } catch {
      /* a fetch that throws synchronously (blocked, polyfilled) loses this batch only */
      return Promise.resolve()
    }
  }

  const flush = (keepalive = false): Promise<void> => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
    const sends: Promise<void>[] = []
    while (queue.length) sends.push(send(queue.splice(0, batchSize), keepalive))
    return Promise.all(sends).then(() => undefined)
  }

  // Don't lose the last events when the visitor leaves.
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void flush(true)
    })
  }
  if (typeof addEventListener === 'function') addEventListener('pagehide', () => void flush(true))

  return {
    name: 'gateway',
    export(events: TraceEventRecord[]) {
      queue.push(...events)
      if (queue.length > maxQueue) queue = queue.slice(queue.length - maxQueue)
      if (queue.length >= batchSize) void flush()
      else if (timer === null) timer = setTimeout(() => void flush(), flushMs)
    },
    flush,
  }
}
