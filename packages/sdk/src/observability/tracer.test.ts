import { describe, expect, it, vi } from 'vitest'
import { createTraceBuffer } from './buffer.js'
import { createSampler } from './sampler.js'
import { scrubValue } from './scrub.js'
import { createTracer, type TraceExporter } from './tracer.js'

describe('trace buffer', () => {
  it('keeps only the newest events', async () => {
    const tracer = createTracer({ siteId: 'site_1', bufferSize: 2 })
    await tracer.emit({ type: 'agent.missed' })
    await tracer.emit({ type: 'auth.identity_cleared' })
    await tracer.emit({ type: 'authz.policies_set' })
    expect(tracer.list().map((event) => event.type)).toEqual([
      'auth.identity_cleared',
      'authz.policies_set',
    ])
  })

  it('supports a standalone buffer', () => {
    const buffer = createTraceBuffer(1)
    buffer.add({
      id: 'a',
      siteId: 'site_1',
      sessionId: 'ses_1',
      occurredAt: new Date().toISOString(),
      type: 'agent.missed',
      outcome: 'success',
      metadata: {},
    })
    expect(buffer.list()).toHaveLength(1)
    buffer.clear()
    expect(buffer.list()).toHaveLength(0)
  })
})

describe('scrubValue', () => {
  it('redacts configured JSON paths without mutating the input', () => {
    const input = { metadata: { token: 'secret', nested: { keep: true } } }
    const scrubbed = scrubValue(input, ['metadata.token'])
    expect(scrubbed.metadata.token).toBe('[REDACTED]')
    expect(input.metadata.token).toBe('secret')
  })
})

describe('sampler', () => {
  it('samples success and error events independently', () => {
    const random = vi.fn(() => 0.5)
    const sampler = createSampler({ traceRate: 0.25, errorRate: 1, random })
    expect(sampler.shouldKeep({ outcome: 'success' })).toBe(false)
    expect(sampler.shouldKeep({ outcome: 'error' })).toBe(true)
  })
})

describe('tracer', () => {
  it('adds event fields and exports kept events', async () => {
    const exported: unknown[] = []
    const exporter: TraceExporter = {
      name: 'test',
      export(events) {
        exported.push(...events)
      },
    }
    const tracer = createTracer({ siteId: 'site_1', exporters: [exporter] })

    const event = await tracer.emit({
      type: 'memory.updated',
      metadata: { token: 'secret', key: 'cart' },
    })

    expect(event?.siteId).toBe('site_1')
    expect(event?.sessionId).toMatch(/^ses_/)
    expect(event?.metadata.token).toBe('[REDACTED]')
    expect(exported).toHaveLength(1)
  })

  it('drops sampled-out events from the buffer and exporters', async () => {
    const exporter: TraceExporter = { name: 'test', export: vi.fn() }
    const tracer = createTracer({ siteId: 'site_1', traceRate: 0, exporters: [exporter] })
    const event = await tracer.emit({ type: 'agent.missed' })
    expect(event).toBeNull()
    expect(tracer.list()).toHaveLength(0)
    expect(exporter.export).not.toHaveBeenCalled()
  })

  it('stamps metadata.page from the page provider', async () => {
    const tracer = createTracer({ siteId: 'site_1', pageProvider: () => '/checkout' })
    const event = await tracer.emit({ type: 'tool.registered', tool: 'addToCart' })
    expect(event?.metadata.page).toBe('/checkout')
  })

  it('lets the caller override metadata.page', async () => {
    const tracer = createTracer({ siteId: 'site_1', pageProvider: () => '/checkout' })
    const event = await tracer.emit({
      type: 'tool.registered',
      tool: 'addToCart',
      metadata: { page: '/explicit' },
    })
    expect(event?.metadata.page).toBe('/explicit')
  })

  it('omits metadata.page when no page is resolvable (SSR / Node)', async () => {
    const tracer = createTracer({ siteId: 'site_1', pageProvider: () => undefined })
    const event = await tracer.emit({ type: 'agent.missed' })
    expect(event?.metadata).not.toHaveProperty('page')
  })

  it('swallows a throwing page provider', async () => {
    const tracer = createTracer({
      siteId: 'site_1',
      pageProvider: () => {
        throw new Error('boom')
      },
    })
    const event = await tracer.emit({ type: 'agent.missed' })
    expect(event?.metadata).not.toHaveProperty('page')
  })
})
