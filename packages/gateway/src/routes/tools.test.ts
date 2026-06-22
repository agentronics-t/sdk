import { describe, expect, it } from 'vitest'
import type { ToolDescriptor } from '@agentronics/protocol'
import { buildFixture } from '../test/fixtures.js'

const sampleRegistry = {
  tools: [
    {
      name: 'cart.add',
      group: 'cart',
      page: 'browse',
      description: 'Add an item to the cart.',
      inputSchema: { type: 'object', properties: { itemId: { type: 'string' } } },
      outputSchema: { type: 'object', properties: { ok: { type: 'boolean' } } },
      tokens: 42,
    },
    { name: 'cart.checkout', page: 'checkout', description: 'Check out.', tokens: 30 },
  ],
}

describe('tool routes', () => {
  it('returns an empty registry with an etag for a fresh site', async () => {
    const fixture = await buildFixture()
    const res = await fixture.app.request(`/v1/sites/${fixture.orgA.siteId}/tools`, {
      headers: { authorization: `Bearer ${fixture.orgA.publishable}` },
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('etag')).toBeTruthy()
    const body = (await res.json()) as { tools: ToolDescriptor[] }
    expect(body.tools).toEqual([])
  })

  it('PUT registry with the publishable key (browser SDK) and read it back', async () => {
    const fixture = await buildFixture()
    const put = await fixture.app.request(`/v1/sites/${fixture.orgA.siteId}/tools`, {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${fixture.orgA.publishable}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ registry: sampleRegistry }),
    })
    expect(put.status).toBe(200)
    expect((await put.json()) as { count: number }).toMatchObject({ ok: true, count: 2 })

    const res = await fixture.app.request(`/v1/sites/${fixture.orgA.siteId}/tools`, {
      headers: { authorization: `Bearer ${fixture.orgA.publishable}` },
    })
    const body = (await res.json()) as { tools: ToolDescriptor[] }
    expect(body.tools).toHaveLength(2)
    const add = body.tools.find((t) => t.name === 'cart.add')!
    expect(add.page).toBe('browse')
    expect(add.tokens).toBe(42)
    expect(add.inputSchema).toMatchObject({ type: 'object' })
    expect(add.outputSchema).toMatchObject({ type: 'object' })
  })

  it('cross-tenant read returns 403', async () => {
    const fixture = await buildFixture()
    const res = await fixture.app.request(`/v1/sites/${fixture.orgA.siteId}/tools`, {
      headers: { authorization: `Bearer ${fixture.orgB.publishable}` },
    })
    expect(res.status).toBe(403)
  })

  it('invalid body is 400', async () => {
    const fixture = await buildFixture()
    const res = await fixture.app.request(`/v1/sites/${fixture.orgA.siteId}/tools`, {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${fixture.orgA.publishable}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ registry: { tools: [{ description: 'no name' }] } }),
    })
    expect(res.status).toBe(400)
  })

  it('GET requires a bearer', async () => {
    const fixture = await buildFixture()
    const res = await fixture.app.request(`/v1/sites/${fixture.orgA.siteId}/tools`)
    expect(res.status).toBe(401)
  })
})
