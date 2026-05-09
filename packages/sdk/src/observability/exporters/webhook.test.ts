import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TraceEvent } from '@agentronics/protocol'
import { createWebhookExporter } from './webhook.js'

const event = (id: string): TraceEvent => ({
  id,
  siteId: 'site_1',
  sessionId: 'ses_1',
  occurredAt: new Date().toISOString(),
  type: 'agent.missed',
  outcome: 'success',
  metadata: {},
})

describe('webhook exporter', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('queues failed exports and flushes them with the next successful batch', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
    const exporter = createWebhookExporter({
      url: 'https://example.test/webhook',
      fetcher,
      maxRetries: 0,
    })

    await expect(exporter.export([event('a')])).rejects.toThrow(/Webhook exporter failed/)
    await exporter.export([event('b')])

    const body = JSON.parse(fetcher.mock.calls[1]![1]!.body as string) as { events: TraceEvent[] }
    expect(body.events.map((item) => item.id)).toEqual(['a', 'b'])
    expect(window.localStorage.getItem('agtx:webhook:https://example.test/webhook')).toBeNull()
  })
})
