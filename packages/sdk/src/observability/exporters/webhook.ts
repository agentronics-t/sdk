import type { TraceEvent as TraceEventRecord } from '@agentronics/protocol'
import type { TraceExporter } from '../tracer.js'

export interface WebhookExporterOptions {
  url: string
  fetcher?: typeof fetch
  maxRetries?: number
  queueLimit?: number
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export const createWebhookExporter = ({
  url,
  fetcher = fetch,
  maxRetries = 2,
  queueLimit = 500,
}: WebhookExporterOptions): TraceExporter => ({
  name: 'webhook',
  async export(events: TraceEventRecord[]) {
    const queued = readQueue(url)
    const batch = [...queued, ...events].slice(-queueLimit)
    let attempt = 0
    while (true) {
      const response = await fetcher(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ events: batch }),
      })
      if (response.ok) {
        writeQueue(url, [])
        return
      }
      if (attempt >= maxRetries) {
        writeQueue(url, batch)
        throw new Error(`Webhook exporter failed with status ${response.status}.`)
      }
      attempt += 1
      await sleep(100 * attempt)
    }
  },
})

const queueKey = (url: string) => `agtx:webhook:${url}`

const readQueue = (url: string): TraceEventRecord[] => {
  if (typeof window === 'undefined' || !window.localStorage) return []
  try {
    const raw = window.localStorage.getItem(queueKey(url))
    return raw ? (JSON.parse(raw) as TraceEventRecord[]) : []
  } catch {
    return []
  }
}

const writeQueue = (url: string, events: TraceEventRecord[]): void => {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    if (events.length === 0) {
      window.localStorage.removeItem(queueKey(url))
      return
    }
    window.localStorage.setItem(queueKey(url), JSON.stringify(events))
  } catch {
    // If storage is unavailable, webhook export failure still surfaces via the thrown error.
  }
}
