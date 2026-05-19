import type { AgentClass, PolicyRule, SiteMemory, TraceEvent } from '@agentronics/protocol'

export interface OrgRecord {
  id: string
  name: string
  createdAt: string
}

export interface SiteRecord {
  id: string
  orgId: string
  name: string
  createdAt: string
}

export type ApiKeyScope = 'publishable' | 'secret'

export interface ApiKeyRecord {
  id: string
  orgId: string
  scope: ApiKeyScope
  hash: string
  prefix: string
  label: string
  createdAt: string
  revokedAt: string | null
}

export interface PolicyDocument {
  policies: PolicyRule[]
  etag: string
  updatedAt: string
}

export interface MemoryDocument {
  memory: SiteMemory
  etag: string
  updatedAt: string
}

export interface DetectorSignatureDocument {
  signatures: Array<{
    id: string
    status: 'stable' | 'beta' | 'research'
    version: string
    signals: Record<string, unknown>
  }>
  etag: string
  updatedAt: string
}

export interface AuditEntry {
  id: string
  orgId: string
  actor: string
  action: string
  target: string | null
  metadata: Record<string, unknown>
  occurredAt: string
}

export type WebhookDeliveryStatus = 'pending' | 'delivered' | 'failed' | 'dead_letter'

export interface WebhookDelivery {
  id: string
  orgId: string
  url: string
  payload: Record<string, unknown>
  attempts: number
  status: WebhookDeliveryStatus
  lastError: string | null
  scheduledAt: string
  deliveredAt: string | null
}

export interface TraceAggregateRow {
  orgId: string
  siteId: string
  bucketStart: string // ISO hour boundary
  type: TraceEvent['type']
  outcome: TraceEvent['outcome']
  count: number
}

export interface QuotaCounter {
  orgId: string
  period: string // 'YYYY-MM'
  count: number
  limit: number
}

export interface RateLimitWindow {
  key: string
  windowStart: number // unix seconds
  count: number
}

// Per-site verifier configuration for the enterprise auth protocols
// (sso, spiffe, mtls). One row per (site, protocol). google-agent is a
// flavor of spiffe — it reads the spiffe row's `googleTrustDomains`.
export type SiteProtocolName = 'sso' | 'spiffe' | 'mtls'

export interface SsoConfig {
  issuer: string // HTTPS URL; well-known discovery hangs off this
  audiences: string[] // exact-match allowlist for the token's `aud` claim
}

export interface SpiffeConfig {
  trustDomain: string // e.g. 'prod.acme.example'
  bundleEndpoint: string // SPIFFE Bundle URL for JWKS retrieval
  audiences: string[] // exact-match allowlist for the token's `aud` claim
  // Customer-maintained list of GCP trust domains (one per project) that
  // trigger Google vendor enrichment. Empty/omitted = no enrichment.
  googleTrustDomains?: string[]
}

export interface MtlsConfig {
  rootCerts: string[] // PEM-encoded CA certs the customer trusts
  spiffeTrustDomain?: string // accept X.509-SVIDs with this trust domain
  xfccEntryPolicy: 'last' | 'first' | 'only' // see plan §D2
}

export type SiteProtocolConfigPayload = SsoConfig | SpiffeConfig | MtlsConfig

export interface SiteProtocolConfigRecord {
  id: string
  siteId: string
  protocol: SiteProtocolName
  config: SiteProtocolConfigPayload
  createdAt: string
}

export interface OrgRepository {
  create(input: { name: string }): Promise<OrgRecord>
  /** Insert with a known id; no-op if one already exists. Used by the seed flow. */
  upsert(input: { id: string; name: string }): Promise<OrgRecord>
  get(id: string): Promise<OrgRecord | null>
  list(): Promise<OrgRecord[]>
}

export interface SiteRepository {
  create(input: { orgId: string; siteId: string; name: string }): Promise<SiteRecord>
  get(siteId: string): Promise<SiteRecord | null>
  /** Lists every site owned by an org. Used by trace-ingest siteId enforcement. */
  listForOrg(orgId: string): Promise<SiteRecord[]>
  /** Removes a site by id. Caller is responsible for ownership checks. */
  delete(siteId: string): Promise<void>
}

export interface ApiKeyRepository {
  insert(record: ApiKeyRecord): Promise<void>
  findByHash(hash: string): Promise<ApiKeyRecord | null>
  listForOrg(orgId: string): Promise<ApiKeyRecord[]>
  revoke(id: string, occurredAt: string): Promise<void>
}

export interface PolicyRepository {
  get(siteId: string): Promise<PolicyDocument | null>
  put(siteId: string, document: PolicyDocument): Promise<void>
}

export interface MemoryRepository {
  get(siteId: string): Promise<MemoryDocument | null>
  put(siteId: string, document: MemoryDocument): Promise<void>
}

export interface TraceQueryOptions {
  limit?: number
  cursor?: string | null
  agentClass?: AgentClass
  type?: TraceEvent['type']
  since?: string
  until?: string
}

export interface TraceRepository {
  insert(orgId: string, events: TraceEvent[]): Promise<{ accepted: number }>
  list(orgId: string, options?: { limit?: number }): Promise<TraceEvent[]>
  query(
    orgId: string,
    options?: TraceQueryOptions
  ): Promise<{ events: TraceEvent[]; nextCursor: string | null }>
}

export interface WebhookRepository {
  schedule(input: Omit<WebhookDelivery, 'id' | 'attempts' | 'status' | 'lastError' | 'deliveredAt'>): Promise<WebhookDelivery>
  pending(limit?: number): Promise<WebhookDelivery[]>
  markDelivered(id: string, deliveredAt: string): Promise<void>
  markFailed(id: string, error: string, deadLetter: boolean): Promise<void>
  list(orgId: string): Promise<WebhookDelivery[]>
}

export interface AggregatesRepository {
  insert(rows: TraceAggregateRow[]): Promise<void>
  query(orgId: string, options?: { since?: string }): Promise<TraceAggregateRow[]>
}

export interface QuotaRepository {
  /** Increments the counter for the given org and period; returns the post-increment count. */
  increment(orgId: string, period: string, by?: number): Promise<QuotaCounter>
  get(orgId: string, period: string): Promise<QuotaCounter | null>
  setLimit(orgId: string, limit: number): Promise<void>
}

export interface RateLimitRepository {
  /** Atomic check-and-increment within a fixed window. Returns the post-increment count. */
  hit(key: string, windowSeconds: number): Promise<{ count: number; resetAt: number }>
}

export interface SignatureRepository {
  current(): Promise<DetectorSignatureDocument>
}

export interface AuditRepository {
  insert(entry: AuditEntry): Promise<void>
  list(orgId: string): Promise<AuditEntry[]>
}

export interface SiteProtocolConfigRepository {
  upsert(input: {
    siteId: string
    protocol: SiteProtocolName
    config: SiteProtocolConfigPayload
  }): Promise<SiteProtocolConfigRecord>
  getForSite(
    siteId: string,
    protocol: SiteProtocolName
  ): Promise<SiteProtocolConfigRecord | null>
  listForSite(siteId: string): Promise<SiteProtocolConfigRecord[]>
  delete(siteId: string, protocol: SiteProtocolName): Promise<void>
}

export interface Storage {
  orgs: OrgRepository
  sites: SiteRepository
  apiKeys: ApiKeyRepository
  policies: PolicyRepository
  memory: MemoryRepository
  traces: TraceRepository
  signatures: SignatureRepository
  audit: AuditRepository
  webhooks: WebhookRepository
  aggregates: AggregatesRepository
  quota: QuotaRepository
  rateLimit: RateLimitRepository
  siteProtocolConfig: SiteProtocolConfigRepository
}
