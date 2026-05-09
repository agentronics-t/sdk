import { hashApiKey } from '../auth/apiKeys.js'
import type { ApiKeyRecord, Storage } from './types.js'

export interface FixtureSeed {
  orgId: string
  orgName: string
  siteId: string
  publishableKey: string
  secretKey: string
}

/**
 * Seeds a deterministic org + site + key pair. Used by the dev/E2E flow so
 * the dashboard, demo, and gateway agree on identifiers without a real Clerk
 * handshake. Idempotent — every repository call is upsert-shaped.
 */
export const seedFixture = async (storage: Storage, fixture: FixtureSeed): Promise<void> => {
  await storage.orgs.upsert({ id: fixture.orgId, name: fixture.orgName })

  const existingSite = await storage.sites.get(fixture.siteId)
  if (!existingSite) {
    await storage.sites.create({
      orgId: fixture.orgId,
      siteId: fixture.siteId,
      name: fixture.siteId,
    })
  }

  const insertKey = async (scope: 'publishable' | 'secret', plaintext: string) => {
    const hash = hashApiKey(plaintext)
    if (await storage.apiKeys.findByHash(hash)) return
    const record: ApiKeyRecord = {
      id: `key_${scope}_demo`,
      orgId: fixture.orgId,
      scope,
      hash,
      prefix: plaintext.slice(0, 12),
      label: 'fixture',
      createdAt: new Date().toISOString(),
      revokedAt: null,
    }
    await storage.apiKeys.insert(record)
  }
  await insertKey('publishable', fixture.publishableKey)
  await insertKey('secret', fixture.secretKey)
}

export const DEMO_FIXTURE: FixtureSeed = {
  orgId: 'org_demo',
  orgName: 'Demo Org',
  siteId: 'demo-site',
  publishableKey: 'agtx_pk_demo_e2e_publishable_001',
  secretKey: 'agtx_sk_demo_e2e_secret_001',
}
