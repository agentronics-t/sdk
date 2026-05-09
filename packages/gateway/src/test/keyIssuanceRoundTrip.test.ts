import { describe, expect, it } from 'vitest'
import { TraceEvent } from '@agentronics/protocol'
import { createGatewayExporter } from '@agentronics/sdk'
import { buildFixture } from './fixtures.js'

const GATEWAY_URL = 'http://gateway.test'

/**
 * Smoking-gun integration: prove the dashboard's "issue a key" flow lands a
 * usable publishable key in the SDK's hands, and the SDK's gateway exporter
 * uses that key to POST traces that show up on the dashboard's read path.
 *
 * This is the loop a customer walks every day:
 *   1. Sign in to dashboard          (here: Clerk session via x-clerk-user)
 *   2. Issue a key pair              (POST /v1/api-keys)
 *   3. Paste the publishable key     (here: into createGatewayExporter)
 *   4. Run the SDK in a browser      (here: exporter.export)
 *   5. See the trace in the live feed (here: GET /v1/traces)
 *
 * If this test breaks, the dashboard ↔ SDK ↔ gateway integration is broken,
 * full stop. Don't paper over a failure here — the marketing copy on the
 * landing page makes this loop the entire product promise.
 */
describe('key-issuance ↔ SDK ↔ trace-read round-trip', () => {
  it('dashboard-issued pk lets the SDK post traces; the dashboard then reads them back', async () => {
    const fixture = await buildFixture()

    // Step 1+2: dashboard issues a key pair via the Clerk session.
    const issueRes = await fixture.app.request('/v1/api-keys', {
      method: 'POST',
      headers: {
        'x-clerk-user': fixture.orgA.clerkUserId,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ label: 'phase-12-roundtrip' }),
    })
    expect(issueRes.status).toBe(201)
    const issued = (await issueRes.json()) as {
      publishable: { id: string; key: string }
      secret: { id: string; key: string }
    }
    expect(issued.publishable.key.startsWith('agtx_pk_')).toBe(true)
    expect(issued.secret.key.startsWith('agtx_sk_')).toBe(true)

    // Step 3+4: SDK uses the publishable key to post a trace via the same
    // exporter shipped to customers.
    const exporter = createGatewayExporter({
      gatewayUrl: GATEWAY_URL,
      publishableKey: issued.publishable.key,
      fetcher: fixture.fetcher,
    })
    await exporter.export([
      TraceEvent.parse({
        id: 'trc_roundtrip',
        siteId: fixture.orgA.siteId,
        sessionId: 'ses_roundtrip',
        occurredAt: new Date().toISOString(),
        type: 'tool.executed',
        outcome: 'success',
        metadata: { source: 'phase-12-test' },
      }),
    ])

    // Step 5: dashboard reads the trace back via Clerk session.
    const readRes = await fixture.app.request('/v1/traces?limit=10', {
      headers: { 'x-clerk-user': fixture.orgA.clerkUserId },
    })
    expect(readRes.status).toBe(200)
    const readBody = (await readRes.json()) as { events: { id: string; metadata: Record<string, unknown> }[] }
    const ours = readBody.events.find((e) => e.id === 'trc_roundtrip')
    expect(ours).toBeDefined()
    expect(ours?.metadata).toMatchObject({ source: 'phase-12-test' })
  })

  it('a revoked publishable key stops working immediately for trace ingest', async () => {
    const fixture = await buildFixture()

    const issueRes = await fixture.app.request('/v1/api-keys', {
      method: 'POST',
      headers: {
        'x-clerk-user': fixture.orgA.clerkUserId,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ label: 'soon-to-revoke' }),
    })
    const issued = (await issueRes.json()) as {
      publishable: { id: string; key: string }
    }

    await fixture.app.request(`/v1/api-keys/${issued.publishable.id}`, {
      method: 'DELETE',
      headers: { 'x-clerk-user': fixture.orgA.clerkUserId },
    })

    const traceRes = await fixture.app.request('/v1/traces', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${issued.publishable.key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        publishableKey: issued.publishable.key,
        events: [
          TraceEvent.parse({
            id: 'trc_after_revoke',
            siteId: fixture.orgA.siteId,
            sessionId: 'ses_x',
            occurredAt: new Date().toISOString(),
            type: 'tool.executed',
            outcome: 'success',
            metadata: {},
          }),
        ],
      }),
    })
    expect(traceRes.status).toBe(401)
  })
})
