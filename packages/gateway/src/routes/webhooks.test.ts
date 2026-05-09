import { describe, expect, it, vi } from 'vitest'
import { buildFixture } from '../test/fixtures.js'

describe('webhook routes', () => {
  it('schedules a delivery via /v1/webhooks/test (Clerk session)', async () => {
    const fixture = await buildFixture()
    const res = await fixture.app.request('/v1/webhooks/test', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-clerk-user': fixture.orgA.clerkUserId,
      },
      body: JSON.stringify({ url: 'https://example.test/hook', payload: { ping: true } }),
    })
    expect(res.status).toBe(202)
    const body = (await res.json()) as { deliveryId: string }
    expect(body.deliveryId).toMatch(/^wh_/)

    const list = await fixture.storage.webhooks.list(fixture.orgA.id)
    expect(list).toHaveLength(1)
    expect(list[0]?.status).toBe('pending')
  })

  it('cron route requires the secret and drains pending deliveries', async () => {
    const okFetcher = vi.fn(async () => new Response('', { status: 200 }))
    const fixture = await buildFixture({ webhookFetcher: okFetcher })
    await fixture.storage.webhooks.schedule({
      orgId: fixture.orgA.id,
      url: 'https://hook.test/ok',
      payload: { hello: 'world' },
      scheduledAt: new Date().toISOString(),
    })

    const unauthorized = await fixture.app.request('/v1/cron/webhooks', { method: 'POST' })
    expect(unauthorized.status).toBe(401)

    const drained = await fixture.app.request('/v1/cron/webhooks', {
      method: 'POST',
      headers: { 'x-cron-secret': fixture.cronSecret },
    })
    expect(drained.status).toBe(200)
    const body = (await drained.json()) as { delivered: number; deadLettered: number }
    expect(body.delivered).toBe(1)
    expect(okFetcher).toHaveBeenCalledTimes(1)

    const list = await fixture.storage.webhooks.list(fixture.orgA.id)
    expect(list[0]?.status).toBe('delivered')
  })

  it('dead-letters a delivery after 3 failed attempts', async () => {
    const failingFetcher = vi.fn(async () => new Response('boom', { status: 500 }))
    const fixture = await buildFixture({ webhookFetcher: failingFetcher })
    await fixture.storage.webhooks.schedule({
      orgId: fixture.orgA.id,
      url: 'https://hook.test/fail',
      payload: {},
      scheduledAt: new Date().toISOString(),
    })

    for (let i = 0; i < 3; i++) {
      const res = await fixture.app.request('/v1/cron/webhooks', {
        method: 'POST',
        headers: { 'x-cron-secret': fixture.cronSecret },
      })
      expect(res.status).toBe(200)
    }

    const list = await fixture.storage.webhooks.list(fixture.orgA.id)
    expect(list[0]?.status).toBe('dead_letter')
    expect(list[0]?.attempts).toBe(3)
  })

  it('survives a 100-event burst', async () => {
    const okFetcher = vi.fn(async () => new Response('', { status: 200 }))
    const fixture = await buildFixture({ webhookFetcher: okFetcher })
    for (let i = 0; i < 100; i++) {
      await fixture.storage.webhooks.schedule({
        orgId: fixture.orgA.id,
        url: 'https://hook.test/burst',
        payload: { i },
        scheduledAt: new Date().toISOString(),
      })
    }
    const drained = await fixture.app.request('/v1/cron/webhooks', {
      method: 'POST',
      headers: { 'x-cron-secret': fixture.cronSecret },
    })
    const body = (await drained.json()) as { delivered: number; drained: number }
    expect(body.drained).toBe(100)
    expect(body.delivered).toBe(100)
  })
})
