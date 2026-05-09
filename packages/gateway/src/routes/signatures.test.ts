import { describe, expect, it } from 'vitest'
import { buildFixture } from '../test/fixtures.js'

describe('signature routes', () => {
  it('returns the current detector signatures publicly', async () => {
    const fixture = await buildFixture()
    const res = await fixture.app.request('/v1/detector-signatures')
    expect(res.status).toBe(200)
    const etag = res.headers.get('etag')
    expect(etag).toBeTruthy()
    const body = (await res.json()) as { signatures: { id: string }[] }
    expect(body.signatures[0]?.id).toBe('gpt')

    const cached = await fixture.app.request('/v1/detector-signatures', {
      headers: { 'if-none-match': etag! },
    })
    expect(cached.status).toBe(304)
  })
})
