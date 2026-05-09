import type { PolicyRule, SiteMemory, TraceEvent } from '@agentronics/protocol'
import type {
  ApiKeyRecord,
  AuditEntry,
  DetectorSignatureDocument,
  MemoryDocument,
  OrgRecord,
  PolicyDocument,
  QuotaCounter,
  SiteRecord,
  Storage,
  TraceAggregateRow,
  WebhookDelivery,
} from './types.js'

const now = () => new Date().toISOString()

const computeEtag = (value: unknown): string => {
  const json = JSON.stringify(value)
  let hash = 0
  for (let i = 0; i < json.length; i++) {
    hash = (hash * 31 + json.charCodeAt(i)) | 0
  }
  return `W/"${(hash >>> 0).toString(16)}-${json.length.toString(16)}"`
}

export interface InMemoryStorageSeed {
  orgs?: OrgRecord[]
  sites?: SiteRecord[]
  apiKeys?: ApiKeyRecord[]
  policies?: Record<string, PolicyRule[]>
  memory?: Record<string, SiteMemory>
  signatures?: DetectorSignatureDocument['signatures']
}

export const createInMemoryStorage = (seed: InMemoryStorageSeed = {}): Storage => {
  const orgs = new Map<string, OrgRecord>()
  const sites = new Map<string, SiteRecord>()
  const apiKeys = new Map<string, ApiKeyRecord>()
  const policies = new Map<string, PolicyDocument>()
  const memory = new Map<string, MemoryDocument>()
  const traces: Array<{ orgId: string; event: TraceEvent }> = []
  const audit: AuditEntry[] = []
  const webhooks: WebhookDelivery[] = []
  const aggregates: TraceAggregateRow[] = []
  const quotaCounters = new Map<string, QuotaCounter>()
  const rateLimitWindows = new Map<string, { windowStart: number; count: number }>()
  const DEFAULT_QUOTA_LIMIT = 1000

  for (const org of seed.orgs ?? []) orgs.set(org.id, org)
  for (const site of seed.sites ?? []) sites.set(site.id, site)
  for (const key of seed.apiKeys ?? []) apiKeys.set(key.hash, key)
  for (const [siteId, rules] of Object.entries(seed.policies ?? {})) {
    policies.set(siteId, { policies: rules, etag: computeEtag(rules), updatedAt: now() })
  }
  for (const [siteId, snapshot] of Object.entries(seed.memory ?? {})) {
    memory.set(siteId, { memory: snapshot, etag: computeEtag(snapshot), updatedAt: now() })
  }

  const signatures: DetectorSignatureDocument = {
    signatures: seed.signatures ?? [],
    etag: computeEtag(seed.signatures ?? []),
    updatedAt: now(),
  }

  return {
    orgs: {
      async create({ name }) {
        const record: OrgRecord = { id: `org_${cryptoRandom()}`, name, createdAt: now() }
        orgs.set(record.id, record)
        return record
      },
      async upsert({ id, name }) {
        const existing = orgs.get(id)
        if (existing) return existing
        const record: OrgRecord = { id, name, createdAt: now() }
        orgs.set(id, record)
        return record
      },
      async get(id) {
        return orgs.get(id) ?? null
      },
      async list() {
        return [...orgs.values()]
      },
    },
    sites: {
      async create({ orgId, siteId, name }) {
        if (!orgs.has(orgId)) throw new Error(`Unknown org: ${orgId}`)
        const record: SiteRecord = { id: siteId, orgId, name, createdAt: now() }
        sites.set(siteId, record)
        return record
      },
      async get(siteId) {
        return sites.get(siteId) ?? null
      },
      async listForOrg(orgId) {
        return [...sites.values()].filter((site) => site.orgId === orgId)
      },
    },
    apiKeys: {
      async insert(record) {
        apiKeys.set(record.hash, record)
      },
      async findByHash(hash) {
        return apiKeys.get(hash) ?? null
      },
      async listForOrg(orgId) {
        return [...apiKeys.values()].filter((key) => key.orgId === orgId)
      },
      async revoke(id, occurredAt) {
        for (const key of apiKeys.values()) {
          if (key.id === id) key.revokedAt = occurredAt
        }
      },
    },
    policies: {
      async get(siteId) {
        return policies.get(siteId) ?? null
      },
      async put(siteId, document) {
        policies.set(siteId, document)
      },
    },
    memory: {
      async get(siteId) {
        return memory.get(siteId) ?? null
      },
      async put(siteId, document) {
        memory.set(siteId, document)
      },
    },
    traces: {
      async insert(orgId, events) {
        for (const event of events) traces.push({ orgId, event })
        return { accepted: events.length }
      },
      async list(orgId, { limit = 100 } = {}) {
        return traces
          .filter((entry) => entry.orgId === orgId)
          .slice(-limit)
          .map((entry) => entry.event)
      },
      async query(orgId, options = {}) {
        const limit = options.limit ?? 50
        const since = options.since ? Date.parse(options.since) : null
        const until = options.until ? Date.parse(options.until) : null
        const cursor = options.cursor ? Number(options.cursor) : Infinity

        // Sort newest-first then page by occurredAt timestamp.
        const matched = traces
          .filter((entry) => entry.orgId === orgId)
          .map((entry) => entry.event)
          .filter((event) => {
            if (options.agentClass && event.agent?.class !== options.agentClass) return false
            if (options.type && event.type !== options.type) return false
            const occurredAt = Date.parse(event.occurredAt)
            if (since !== null && occurredAt < since) return false
            if (until !== null && occurredAt > until) return false
            return true
          })
          .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
          .filter((event) => Date.parse(event.occurredAt) < cursor)
          .slice(0, limit)

        const nextCursor =
          matched.length === limit && matched[matched.length - 1]
            ? Date.parse(matched[matched.length - 1]!.occurredAt).toString()
            : null
        return { events: matched, nextCursor }
      },
    },
    signatures: {
      async current() {
        return signatures
      },
    },
    audit: {
      async insert(entry) {
        audit.push(entry)
      },
      async list(orgId) {
        return audit.filter((entry) => entry.orgId === orgId)
      },
    },
    webhooks: {
      async schedule(input) {
        const delivery: WebhookDelivery = {
          id: `wh_${cryptoRandom()}`,
          attempts: 0,
          status: 'pending',
          lastError: null,
          deliveredAt: null,
          ...input,
        }
        webhooks.push(delivery)
        return delivery
      },
      async pending(limit = 100) {
        return webhooks.filter((entry) => entry.status === 'pending').slice(0, limit)
      },
      async markDelivered(id, deliveredAt) {
        const entry = webhooks.find((item) => item.id === id)
        if (!entry) return
        entry.status = 'delivered'
        entry.deliveredAt = deliveredAt
        entry.attempts += 1
      },
      async markFailed(id, error, deadLetter) {
        const entry = webhooks.find((item) => item.id === id)
        if (!entry) return
        entry.attempts += 1
        entry.lastError = error
        entry.status = deadLetter ? 'dead_letter' : 'pending'
      },
      async list(orgId) {
        return webhooks.filter((entry) => entry.orgId === orgId)
      },
    },
    aggregates: {
      async insert(rows) {
        for (const row of rows) {
          const existing = aggregates.find(
            (entry) =>
              entry.orgId === row.orgId &&
              entry.siteId === row.siteId &&
              entry.bucketStart === row.bucketStart &&
              entry.type === row.type &&
              entry.outcome === row.outcome
          )
          if (existing) existing.count += row.count
          else aggregates.push({ ...row })
        }
      },
      async query(orgId, options = {}) {
        const since = options.since ? Date.parse(options.since) : null
        return aggregates.filter((row) => {
          if (row.orgId !== orgId) return false
          if (since !== null && Date.parse(row.bucketStart) < since) return false
          return true
        })
      },
    },
    quota: {
      async increment(orgId, period, by = 1) {
        const key = `${orgId}:${period}`
        const existing = quotaCounters.get(key) ?? {
          orgId,
          period,
          count: 0,
          limit: DEFAULT_QUOTA_LIMIT,
        }
        existing.count += by
        quotaCounters.set(key, existing)
        return { ...existing }
      },
      async get(orgId, period) {
        const counter = quotaCounters.get(`${orgId}:${period}`)
        return counter ? { ...counter } : null
      },
      async setLimit(orgId, limit) {
        for (const counter of quotaCounters.values()) {
          if (counter.orgId === orgId) counter.limit = limit
        }
        // Also seed the current period if no counter exists, so future increments inherit.
        const period = new Date().toISOString().slice(0, 7)
        const key = `${orgId}:${period}`
        if (!quotaCounters.has(key)) {
          quotaCounters.set(key, { orgId, period, count: 0, limit })
        }
      },
    },
    rateLimit: {
      async hit(key, windowSeconds) {
        const nowSec = Math.floor(Date.now() / 1000)
        const windowStart = nowSec - (nowSec % windowSeconds)
        const existing = rateLimitWindows.get(key)
        if (!existing || existing.windowStart !== windowStart) {
          rateLimitWindows.set(key, { windowStart, count: 1 })
          return { count: 1, resetAt: (windowStart + windowSeconds) * 1000 }
        }
        existing.count += 1
        return { count: existing.count, resetAt: (windowStart + windowSeconds) * 1000 }
      },
    },
  }

  function cryptoRandom(): string {
    if (typeof globalThis.crypto?.randomUUID === 'function') {
      return globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 16)
    }
    return Math.random().toString(36).slice(2, 18)
  }
}

export { computeEtag }
