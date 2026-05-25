import { integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

// Tables match the storage interfaces in `./types.ts`. The in-memory adapter is
// authoritative for tests; the drizzle adapter (wired in `./postgres.ts`,
// landing alongside the staging deploy) reads/writes these tables.

export const orgs = pgTable('orgs', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const sites = pgTable('sites', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const apiKeys = pgTable('api_keys', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull(),
  scope: text('scope').notNull(),
  hash: text('hash').notNull().unique(),
  prefix: text('prefix').notNull(),
  label: text('label').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
})

export const policies = pgTable('policies', {
  siteId: text('site_id').primaryKey(),
  document: jsonb('document').notNull(),
  etag: text('etag').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const memory = pgTable('memory', {
  siteId: text('site_id').primaryKey(),
  document: jsonb('document').notNull(),
  etag: text('etag').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const traces = pgTable('traces', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull(),
  siteId: text('site_id').notNull(),
  event: jsonb('event').notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
})

export const audit = pgTable('audit', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull(),
  actor: text('actor').notNull(),
  action: text('action').notNull(),
  target: text('target'),
  metadata: jsonb('metadata').notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
})

export const webhookDeliveries = pgTable('webhook_deliveries', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull(),
  url: text('url').notNull(),
  payload: jsonb('payload').notNull(),
  attempts: integer('attempts').notNull().default(0),
  status: text('status').notNull(), // pending | delivered | failed | dead_letter
  lastError: text('last_error'),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull().defaultNow(),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
})

export const traceAggregates = pgTable('trace_aggregates', {
  orgId: text('org_id').notNull(),
  siteId: text('site_id').notNull(),
  bucketStart: timestamp('bucket_start', { withTimezone: true }).notNull(),
  type: text('type').notNull(),
  outcome: text('outcome').notNull(),
  count: integer('count').notNull().default(0),
})

export const quotaCounters = pgTable('quota_counters', {
  orgId: text('org_id').notNull(),
  period: text('period').notNull(), // 'YYYY-MM'
  count: integer('count').notNull().default(0),
  limit: integer('limit').notNull().default(1000),
})

export const rateLimitWindows = pgTable('rate_limit_windows', {
  key: text('key').notNull(),
  windowStart: integer('window_start').notNull(),
  count: integer('count').notNull().default(0),
})

// Per-site verifier configuration for the four enterprise auth protocols
// (sso, spiffe, mtls). google-agent reads the spiffe row's
// `googleTrustDomains` field — no separate row. Config shape is encoded
// in jsonb and validated at write time by the dashboard / SQL inserter;
// types live in `./types.ts`.
export const siteProtocolConfig = pgTable(
  'site_protocol_config',
  {
    id: text('id').primaryKey(),
    siteId: text('site_id').notNull(),
    protocol: text('protocol').notNull(), // 'sso' | 'spiffe' | 'mtls'
    config: jsonb('config').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    siteProtocolUnique: uniqueIndex('site_protocol_config_site_protocol_idx').on(
      table.siteId,
      table.protocol
    ),
  })
)
