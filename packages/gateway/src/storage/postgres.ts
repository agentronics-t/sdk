import { drizzle } from 'drizzle-orm/neon-http'
import { neon } from '@neondatabase/serverless'
import { and, desc, eq, gte, lt, lte, sql } from 'drizzle-orm'
import * as schema from './schema.js'
import { computeEtag } from './memory.js'
import type {
  ApiKeyScope,
  SiteProtocolConfigPayload,
  SiteProtocolConfigRecord,
  SiteProtocolName,
  Storage,
  TraceAggregateRow,
  WebhookDeliveryStatus,
} from './types.js'
import type { TraceEvent } from '@agentronics/protocol'

const cryptoRandom = (): string => {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 16)
  }
  return Math.random().toString(36).slice(2, 18)
}

const isoOrNull = (value: Date | null | undefined): string | null =>
  value ? value.toISOString() : null

/**
 * Drizzle-backed Storage implementation. Used in production whenever
 * DATABASE_URL is set; the in-memory adapter remains the test/local
 * default. Methods are keyed off the `Storage` interface in `./types.ts`
 * so the rest of the gateway is storage-agnostic.
 */
export const createPostgresStorage = (databaseUrl: string): Storage => {
  const client = neon(databaseUrl)
  const db = drizzle(client, { schema })

  const DEFAULT_QUOTA_LIMIT = 1000

  return {
    orgs: {
      async create({ name }) {
        const id = `org_${cryptoRandom()}`
        const [row] = await db
          .insert(schema.orgs)
          .values({ id, name })
          .returning()
        return { id: row!.id, name: row!.name, createdAt: row!.createdAt.toISOString() }
      },
      async upsert({ id, name }) {
        const [row] = await db
          .insert(schema.orgs)
          .values({ id, name })
          .onConflictDoNothing({ target: schema.orgs.id })
          .returning()
        if (row) return { id: row.id, name: row.name, createdAt: row.createdAt.toISOString() }
        const existing = await db
          .select()
          .from(schema.orgs)
          .where(eq(schema.orgs.id, id))
          .limit(1)
        const e = existing[0]!
        return { id: e.id, name: e.name, createdAt: e.createdAt.toISOString() }
      },
      async get(id) {
        const rows = await db.select().from(schema.orgs).where(eq(schema.orgs.id, id)).limit(1)
        const r = rows[0]
        return r ? { id: r.id, name: r.name, createdAt: r.createdAt.toISOString() } : null
      },
      async list() {
        const rows = await db.select().from(schema.orgs)
        return rows.map((r) => ({ id: r.id, name: r.name, createdAt: r.createdAt.toISOString() }))
      },
    },

    sites: {
      async create({ orgId, siteId, name }) {
        const orgRows = await db
          .select({ id: schema.orgs.id })
          .from(schema.orgs)
          .where(eq(schema.orgs.id, orgId))
          .limit(1)
        if (!orgRows[0]) throw new Error(`Unknown org: ${orgId}`)
        const [row] = await db
          .insert(schema.sites)
          .values({ id: siteId, orgId, name })
          .returning()
        return {
          id: row!.id,
          orgId: row!.orgId,
          name: row!.name,
          createdAt: row!.createdAt.toISOString(),
        }
      },
      async get(siteId) {
        const rows = await db.select().from(schema.sites).where(eq(schema.sites.id, siteId)).limit(1)
        const r = rows[0]
        return r
          ? { id: r.id, orgId: r.orgId, name: r.name, createdAt: r.createdAt.toISOString() }
          : null
      },
      async listForOrg(orgId) {
        const rows = await db.select().from(schema.sites).where(eq(schema.sites.orgId, orgId))
        return rows.map((r) => ({
          id: r.id,
          orgId: r.orgId,
          name: r.name,
          createdAt: r.createdAt.toISOString(),
        }))
      },
      async delete(siteId) {
        // Cascade per-site protocol config rows, then the site itself.
        // Both tables are part of the canonical migration set
        // (drizzle/0001_site_protocol_config.sql); a failure here means
        // the DB is mis-migrated and should fail loudly rather than leave
        // orphans.
        await db
          .delete(schema.siteProtocolConfig)
          .where(eq(schema.siteProtocolConfig.siteId, siteId))
        await db.delete(schema.sites).where(eq(schema.sites.id, siteId))
      },
    },

    apiKeys: {
      async insert(record) {
        await db.insert(schema.apiKeys).values({
          id: record.id,
          orgId: record.orgId,
          scope: record.scope,
          hash: record.hash,
          prefix: record.prefix,
          label: record.label,
          revokedAt: record.revokedAt ? new Date(record.revokedAt) : null,
        })
      },
      async findByHash(hash) {
        const rows = await db.select().from(schema.apiKeys).where(eq(schema.apiKeys.hash, hash)).limit(1)
        const r = rows[0]
        return r
          ? {
              id: r.id,
              orgId: r.orgId,
              scope: r.scope as ApiKeyScope,
              hash: r.hash,
              prefix: r.prefix,
              label: r.label,
              createdAt: r.createdAt.toISOString(),
              revokedAt: isoOrNull(r.revokedAt),
            }
          : null
      },
      async listForOrg(orgId) {
        const rows = await db.select().from(schema.apiKeys).where(eq(schema.apiKeys.orgId, orgId))
        return rows.map((r) => ({
          id: r.id,
          orgId: r.orgId,
          scope: r.scope as ApiKeyScope,
          hash: r.hash,
          prefix: r.prefix,
          label: r.label,
          createdAt: r.createdAt.toISOString(),
          revokedAt: isoOrNull(r.revokedAt),
        }))
      },
      async revoke(id, occurredAt) {
        await db
          .update(schema.apiKeys)
          .set({ revokedAt: new Date(occurredAt) })
          .where(eq(schema.apiKeys.id, id))
      },
    },

    policies: {
      async get(siteId) {
        const rows = await db
          .select()
          .from(schema.policies)
          .where(eq(schema.policies.siteId, siteId))
          .limit(1)
        const r = rows[0]
        if (!r) return null
        const doc = r.document as { policies: unknown[] }
        return {
          policies: doc.policies as never,
          etag: r.etag,
          updatedAt: r.updatedAt.toISOString(),
        }
      },
      async put(siteId, document) {
        await db
          .insert(schema.policies)
          .values({
            siteId,
            document: { policies: document.policies },
            etag: document.etag,
            updatedAt: new Date(document.updatedAt),
          })
          .onConflictDoUpdate({
            target: schema.policies.siteId,
            set: {
              document: { policies: document.policies },
              etag: document.etag,
              updatedAt: new Date(document.updatedAt),
            },
          })
      },
    },

    memory: {
      async get(siteId) {
        const rows = await db
          .select()
          .from(schema.memory)
          .where(eq(schema.memory.siteId, siteId))
          .limit(1)
        const r = rows[0]
        if (!r) return null
        const doc = r.document as { memory: unknown }
        return {
          memory: doc.memory as never,
          etag: r.etag,
          updatedAt: r.updatedAt.toISOString(),
        }
      },
      async put(siteId, document) {
        await db
          .insert(schema.memory)
          .values({
            siteId,
            document: { memory: document.memory },
            etag: document.etag,
            updatedAt: new Date(document.updatedAt),
          })
          .onConflictDoUpdate({
            target: schema.memory.siteId,
            set: {
              document: { memory: document.memory },
              etag: document.etag,
              updatedAt: new Date(document.updatedAt),
            },
          })
      },
    },
    tools: {
      async get(siteId) {
        const rows = await db
          .select()
          .from(schema.tools)
          .where(eq(schema.tools.siteId, siteId))
          .limit(1)
        const r = rows[0]
        if (!r) return null
        const doc = r.document as { tools: unknown }
        return {
          tools: (doc.tools ?? []) as never,
          etag: r.etag,
          updatedAt: r.updatedAt.toISOString(),
        }
      },
      async put(siteId, document) {
        await db
          .insert(schema.tools)
          .values({
            siteId,
            document: { tools: document.tools },
            etag: document.etag,
            updatedAt: new Date(document.updatedAt),
          })
          .onConflictDoUpdate({
            target: schema.tools.siteId,
            set: {
              document: { tools: document.tools },
              etag: document.etag,
              updatedAt: new Date(document.updatedAt),
            },
          })
      },
    },

    traces: {
      async insert(orgId, events) {
        if (events.length === 0) return { accepted: 0 }
        await db.insert(schema.traces).values(
          events.map((event) => ({
            id: `tr_${cryptoRandom()}`,
            orgId,
            siteId: event.siteId,
            event: event as unknown as Record<string, unknown>,
            occurredAt: new Date(event.occurredAt),
          }))
        )
        return { accepted: events.length }
      },
      async list(orgId, { limit = 100 } = {}) {
        const rows = await db
          .select()
          .from(schema.traces)
          .where(eq(schema.traces.orgId, orgId))
          .orderBy(desc(schema.traces.occurredAt))
          .limit(limit)
        return rows.map((r) => r.event as TraceEvent)
      },
      async query(orgId, options = {}) {
        const limit = options.limit ?? 50
        const conditions = [eq(schema.traces.orgId, orgId)]
        if (options.since) conditions.push(gte(schema.traces.occurredAt, new Date(options.since)))
        if (options.until) conditions.push(lte(schema.traces.occurredAt, new Date(options.until)))
        if (options.cursor) {
          conditions.push(lt(schema.traces.occurredAt, new Date(Number(options.cursor))))
        }
        const rows = await db
          .select()
          .from(schema.traces)
          .where(and(...conditions))
          .orderBy(desc(schema.traces.occurredAt))
          .limit(limit + 1)

        // Filter agentClass / type in JS (the event body is JSON).
        const filtered = rows
          .map((r) => r.event as TraceEvent)
          .filter((event) => {
            if (options.agentClass && event.agent?.class !== options.agentClass) return false
            if (options.type && event.type !== options.type) return false
            return true
          })
          .slice(0, limit)

        const last = filtered[filtered.length - 1]
        const nextCursor =
          filtered.length === limit && last ? Date.parse(last.occurredAt).toString() : null
        return { events: filtered, nextCursor }
      },
    },

    signatures: {
      async current() {
        // Detector signatures are managed out-of-band today (see
        // sdk-detection-spike.md). Return an empty stable doc for now;
        // when the management plane lands it'll write to a `signatures`
        // table that this method reads.
        const empty: Array<never> = []
        return {
          signatures: empty,
          etag: computeEtag(empty),
          updatedAt: new Date().toISOString(),
        }
      },
    },

    audit: {
      async insert(entry) {
        await db.insert(schema.audit).values({
          id: entry.id,
          orgId: entry.orgId,
          actor: entry.actor,
          action: entry.action,
          target: entry.target,
          metadata: entry.metadata,
          occurredAt: new Date(entry.occurredAt),
        })
      },
      async list(orgId) {
        const rows = await db
          .select()
          .from(schema.audit)
          .where(eq(schema.audit.orgId, orgId))
          .orderBy(desc(schema.audit.occurredAt))
        return rows.map((r) => ({
          id: r.id,
          orgId: r.orgId,
          actor: r.actor,
          action: r.action,
          target: r.target,
          metadata: r.metadata as Record<string, unknown>,
          occurredAt: r.occurredAt.toISOString(),
        }))
      },
    },

    webhooks: {
      async schedule(input) {
        const id = `wh_${cryptoRandom()}`
        const [row] = await db
          .insert(schema.webhookDeliveries)
          .values({
            id,
            orgId: input.orgId,
            url: input.url,
            payload: input.payload,
            attempts: 0,
            status: 'pending' as WebhookDeliveryStatus,
            scheduledAt: new Date(input.scheduledAt),
          })
          .returning()
        return {
          id: row!.id,
          orgId: row!.orgId,
          url: row!.url,
          payload: row!.payload as Record<string, unknown>,
          attempts: row!.attempts,
          status: row!.status as WebhookDeliveryStatus,
          lastError: row!.lastError,
          scheduledAt: row!.scheduledAt.toISOString(),
          deliveredAt: isoOrNull(row!.deliveredAt),
        }
      },
      async pending(limit = 100) {
        const rows = await db
          .select()
          .from(schema.webhookDeliveries)
          .where(eq(schema.webhookDeliveries.status, 'pending'))
          .orderBy(schema.webhookDeliveries.scheduledAt)
          .limit(limit)
        return rows.map((r) => ({
          id: r.id,
          orgId: r.orgId,
          url: r.url,
          payload: r.payload as Record<string, unknown>,
          attempts: r.attempts,
          status: r.status as WebhookDeliveryStatus,
          lastError: r.lastError,
          scheduledAt: r.scheduledAt.toISOString(),
          deliveredAt: isoOrNull(r.deliveredAt),
        }))
      },
      async markDelivered(id, deliveredAt) {
        await db
          .update(schema.webhookDeliveries)
          .set({
            status: 'delivered',
            deliveredAt: new Date(deliveredAt),
            attempts: sql`${schema.webhookDeliveries.attempts} + 1`,
          })
          .where(eq(schema.webhookDeliveries.id, id))
      },
      async markFailed(id, error, deadLetter) {
        await db
          .update(schema.webhookDeliveries)
          .set({
            status: deadLetter ? 'dead_letter' : 'pending',
            lastError: error,
            attempts: sql`${schema.webhookDeliveries.attempts} + 1`,
          })
          .where(eq(schema.webhookDeliveries.id, id))
      },
      async list(orgId) {
        const rows = await db
          .select()
          .from(schema.webhookDeliveries)
          .where(eq(schema.webhookDeliveries.orgId, orgId))
          .orderBy(desc(schema.webhookDeliveries.scheduledAt))
        return rows.map((r) => ({
          id: r.id,
          orgId: r.orgId,
          url: r.url,
          payload: r.payload as Record<string, unknown>,
          attempts: r.attempts,
          status: r.status as WebhookDeliveryStatus,
          lastError: r.lastError,
          scheduledAt: r.scheduledAt.toISOString(),
          deliveredAt: isoOrNull(r.deliveredAt),
        }))
      },
    },

    aggregates: {
      async insert(rows) {
        // The schema doesn't have a unique index on the natural key
        // (orgId, siteId, bucketStart, type, outcome), so this is a
        // SELECT-then-UPDATE merge instead of an UPSERT. Acceptable for
        // a low-frequency cron-aggregation step; revisit if the rollup
        // job moves into the request path.
        //
        // Replace, don't add: the compactor recomputes full bucket counts
        // on every run, so summing here would double-count overlapping
        // scan windows.
        for (const row of rows) {
          const conditions = and(
            eq(schema.traceAggregates.orgId, row.orgId),
            eq(schema.traceAggregates.siteId, row.siteId),
            eq(schema.traceAggregates.bucketStart, new Date(row.bucketStart)),
            eq(schema.traceAggregates.type, row.type),
            eq(schema.traceAggregates.outcome, row.outcome)
          )
          const existing = await db
            .select()
            .from(schema.traceAggregates)
            .where(conditions)
            .limit(1)
          if (existing[0]) {
            await db
              .update(schema.traceAggregates)
              .set({ count: row.count })
              .where(conditions)
          } else {
            await db.insert(schema.traceAggregates).values({
              orgId: row.orgId,
              siteId: row.siteId,
              bucketStart: new Date(row.bucketStart),
              type: row.type,
              outcome: row.outcome,
              count: row.count,
            })
          }
        }
      },
      async query(orgId, options = {}) {
        const conditions = [eq(schema.traceAggregates.orgId, orgId)]
        if (options.since) {
          conditions.push(gte(schema.traceAggregates.bucketStart, new Date(options.since)))
        }
        const rows = await db
          .select()
          .from(schema.traceAggregates)
          .where(and(...conditions))
          .orderBy(schema.traceAggregates.bucketStart)
        return rows.map<TraceAggregateRow>((r) => ({
          orgId: r.orgId,
          siteId: r.siteId,
          bucketStart: r.bucketStart.toISOString(),
          type: r.type as TraceAggregateRow['type'],
          outcome: r.outcome as TraceAggregateRow['outcome'],
          count: r.count,
        }))
      },
    },

    quota: {
      async increment(orgId, period, by = 1) {
        // SELECT-then-UPDATE merge; no unique index on (orgId, period)
        // in the current schema. Race-safe enough for monthly quotas
        // where over-count by 1-2 doesn't matter.
        const conditions = and(
          eq(schema.quotaCounters.orgId, orgId),
          eq(schema.quotaCounters.period, period)
        )
        const existing = await db
          .select()
          .from(schema.quotaCounters)
          .where(conditions)
          .limit(1)
        if (existing[0]) {
          await db
            .update(schema.quotaCounters)
            .set({ count: sql`${schema.quotaCounters.count} + ${by}` })
            .where(conditions)
          return {
            orgId,
            period,
            count: existing[0].count + by,
            limit: existing[0].limit,
          }
        }
        await db.insert(schema.quotaCounters).values({
          orgId,
          period,
          count: by,
          limit: DEFAULT_QUOTA_LIMIT,
        })
        return { orgId, period, count: by, limit: DEFAULT_QUOTA_LIMIT }
      },
      async get(orgId, period) {
        const rows = await db
          .select()
          .from(schema.quotaCounters)
          .where(
            and(eq(schema.quotaCounters.orgId, orgId), eq(schema.quotaCounters.period, period))
          )
          .limit(1)
        const r = rows[0]
        return r ? { orgId: r.orgId, period: r.period, count: r.count, limit: r.limit } : null
      },
      async setLimit(orgId, limit) {
        await db
          .update(schema.quotaCounters)
          .set({ limit })
          .where(eq(schema.quotaCounters.orgId, orgId))
        // Seed the current period so future increments inherit the new limit.
        const period = new Date().toISOString().slice(0, 7)
        const conditions = and(
          eq(schema.quotaCounters.orgId, orgId),
          eq(schema.quotaCounters.period, period)
        )
        const existing = await db
          .select()
          .from(schema.quotaCounters)
          .where(conditions)
          .limit(1)
        if (!existing[0]) {
          await db
            .insert(schema.quotaCounters)
            .values({ orgId, period, count: 0, limit })
        }
      },
    },

    siteProtocolConfig: {
      async upsert({ siteId, protocol, config }) {
        // One row per (siteId, protocol). No unique index in the schema
        // today — the dashboard / SQL inserter is the writer, so we
        // delete then insert to keep semantics simple. Acceptable
        // because writes are rare (config edits) and reads are cached
        // upstream in the verifier.
        await db
          .delete(schema.siteProtocolConfig)
          .where(
            and(
              eq(schema.siteProtocolConfig.siteId, siteId),
              eq(schema.siteProtocolConfig.protocol, protocol)
            )
          )
        const id = `spc_${cryptoRandom()}`
        const [row] = await db
          .insert(schema.siteProtocolConfig)
          .values({
            id,
            siteId,
            protocol,
            config: config as unknown as Record<string, unknown>,
          })
          .returning()
        return {
          id: row!.id,
          siteId: row!.siteId,
          protocol: row!.protocol as SiteProtocolName,
          config: row!.config as SiteProtocolConfigPayload,
          createdAt: row!.createdAt.toISOString(),
        }
      },
      async getForSite(siteId, protocol) {
        const rows = await db
          .select()
          .from(schema.siteProtocolConfig)
          .where(
            and(
              eq(schema.siteProtocolConfig.siteId, siteId),
              eq(schema.siteProtocolConfig.protocol, protocol)
            )
          )
          .limit(1)
        const r = rows[0]
        if (!r) return null
        return {
          id: r.id,
          siteId: r.siteId,
          protocol: r.protocol as SiteProtocolName,
          config: r.config as SiteProtocolConfigPayload,
          createdAt: r.createdAt.toISOString(),
        }
      },
      async listForSite(siteId) {
        const rows = await db
          .select()
          .from(schema.siteProtocolConfig)
          .where(eq(schema.siteProtocolConfig.siteId, siteId))
        return rows.map<SiteProtocolConfigRecord>((r) => ({
          id: r.id,
          siteId: r.siteId,
          protocol: r.protocol as SiteProtocolName,
          config: r.config as SiteProtocolConfigPayload,
          createdAt: r.createdAt.toISOString(),
        }))
      },
      async delete(siteId, protocol) {
        await db
          .delete(schema.siteProtocolConfig)
          .where(
            and(
              eq(schema.siteProtocolConfig.siteId, siteId),
              eq(schema.siteProtocolConfig.protocol, protocol)
            )
          )
      },
    },

    rateLimit: {
      async hit(key, windowSeconds) {
        // Same SELECT-then-UPDATE merge. For request-path rate limiting
        // this can over-allow under heavy concurrency; the upstream
        // caller is the first defence and Postgres is the safety net.
        const nowSec = Math.floor(Date.now() / 1000)
        const windowStart = nowSec - (nowSec % windowSeconds)
        const conditions = and(
          eq(schema.rateLimitWindows.key, key),
          eq(schema.rateLimitWindows.windowStart, windowStart)
        )
        const existing = await db
          .select()
          .from(schema.rateLimitWindows)
          .where(conditions)
          .limit(1)
        if (existing[0]) {
          await db
            .update(schema.rateLimitWindows)
            .set({ count: sql`${schema.rateLimitWindows.count} + 1` })
            .where(conditions)
          return {
            count: existing[0].count + 1,
            resetAt: (windowStart + windowSeconds) * 1000,
          }
        }
        // Garbage-collect older windows for this key opportunistically.
        await db
          .delete(schema.rateLimitWindows)
          .where(
            and(
              eq(schema.rateLimitWindows.key, key),
              lt(schema.rateLimitWindows.windowStart, windowStart)
            )
          )
        await db
          .insert(schema.rateLimitWindows)
          .values({ key, windowStart, count: 1 })
        return { count: 1, resetAt: (windowStart + windowSeconds) * 1000 }
      },
    },
  }
}
