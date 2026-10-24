import type { TraceBatch, TraceEvent as TraceEventRecord } from '@agentronics/protocol'
import type { TraceExporter } from '../tracer.js'
import type { GovernedTool } from '../../tools/registry.js'
import type { PolicyRule } from '@agentronics/protocol'
import { toToolDescriptor } from '../../tools/toolSync.js'

/** Mirrors ApiKeyIdentity in @agentronics/sdk/server (kept structural to avoid a server import). */
export interface ApiKeyIdentity {
  agentId: string
  name?: string
  vendor?: string
  scopes?: string[]
}

export interface IntelExporterOptions {
  /**
   * Agentronics API base URL (shown in the console under Settings) — the
   * `/v1/sdk/events` path is appended automatically — or the full ingest URL.
   */
  url: string
  /**
   * Per-tenant SDK ingest key (`agtx_ik_…`), minted in the dashboard Settings.
   * This is a **secret**: use this exporter in your backend only, never in the
   * browser. (The browser SDK should forward traces to your backend, which
   * relays them with the key.)
   */
  ingestKey: string
  fetcher?: typeof fetch
}

const INGEST_PATH = '/v1/sdk/events'

/**
 * Stream traces (agent sign-ins, verifications, access decisions) to the
 * Agentronics dashboard.
 * POSTs a `TraceBatch` to the intel-api ingest endpoint with the ingest key.
 * Intended for Node/server use (the existing webhook exporter is browser-bound
 * and can't send an auth header).
 */
/** @deprecated Use createDashboardExporter (same function). */
export const createIntelExporter = ({
  url,
  ingestKey,
  fetcher = fetch,
}: IntelExporterOptions): TraceExporter => {
  const base = url.replace(/\/$/, '')
  const endpoint = base.endsWith(INGEST_PATH) ? base : `${base}${INGEST_PATH}`
  return {
    name: 'intel',
    async export(events: TraceEventRecord[]) {
      const batch: TraceBatch = { events }
      const response = await fetcher(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${ingestKey}`,
        },
        body: JSON.stringify(batch),
      })
      if (!response.ok) {
        throw new Error(`Intel exporter failed with status ${response.status}.`)
      }
    },
  }
}

export interface IntelSyncOptions {
  /** Agentronics API base URL (shown in the console under Settings). */
  url: string
  /** Per-tenant SDK ingest key (`agtx_ik_…`). Backend-only — never the browser. */
  ingestKey: string
  /** The site these tools/memory belong to (matches your SDK `siteId`). */
  siteId: string
  fetcher?: typeof fetch
}

/**
 * Push the authoritative tool registry + site-memory snapshot to the
 * Agentronics console — the full data the WebMCP Tools + Knaph pages need,
 * which is too large for the lightweight trace stream. Call after `syncTools()`
 * / `provideSiteMemory(...)`. Backend/server use only (the key is secret).
 */
export interface IntelSync {
  /** POST the registry to /v1/sdk/tools. Returns the number of tools sent. */
  pushTools(tools: GovernedTool[]): Promise<number>
  /** POST the site-memory snapshot (+ optional quality score) to /v1/sdk/memory. */
  pushMemory(snapshot: object, score?: number): Promise<void>
  /**
   * Fetch what the console manages for this site: authorization rules and the
   * tool descriptions you approved in Procedural memory. Pass them to the
   * browser SDK — `init({ policies, toolDescriptions })`.
   */
  pullConfig(): Promise<DashboardConfig>
  /**
   * An agent-API-key verifier for `createAgentAuth({ apiKey: { verify } })`
   * that checks keys minted in the console, live — revoking a key in the
   * console takes effect within `cacheSeconds` (default 60).
   */
  keyVerifier(options?: { cacheSeconds?: number }): (key: string) => Promise<ApiKeyIdentity | null>
}

export interface DashboardConfig {
  policies: PolicyRule[]
  /** tool name → approved description (replaces the code's description when published). */
  toolDescriptions: Record<string, string>
  /** The site-memory snapshot last pushed for this site (null if none). */
  siteMemory: Record<string, unknown> | null
  fetchedAt: string
}

/** @deprecated Use createDashboardSync (same function). */
export const createIntelSync = ({
  url,
  ingestKey,
  siteId,
  fetcher = fetch,
}: IntelSyncOptions): IntelSync => {
  const base = url.replace(/\/$/, '')
  const call = async (path: string, body: unknown): Promise<Response> => {
    const response = await fetcher(`${base}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${ingestKey}`,
      },
      body: JSON.stringify(body),
    })
    if (!response.ok) {
      throw new Error(`Intel sync ${path} failed with status ${response.status}.`)
    }
    return response
  }
  const post = async (path: string, body: unknown): Promise<void> => {
    await call(path, body)
  }
  const keyCache = new Map<string, { value: ApiKeyIdentity | null; until: number }>()

  return {
    async pushTools(tools: GovernedTool[]) {
      const descriptors = tools.map(toToolDescriptor)
      await post('/v1/sdk/tools', { siteId, tools: descriptors })
      return descriptors.length
    },
    async pushMemory(snapshot: object, score?: number) {
      await post('/v1/sdk/memory', {
        siteId,
        snapshot,
        ...(typeof score === 'number' ? { score } : {}),
      })
    },
    async pullConfig() {
      const body = (await (await call('/v1/sdk/config', { siteId })).json()) as Partial<DashboardConfig>
      return {
        policies: Array.isArray(body.policies) ? body.policies : [],
        toolDescriptions: body.toolDescriptions && typeof body.toolDescriptions === 'object' ? body.toolDescriptions : {},
        siteMemory: body.siteMemory && typeof body.siteMemory === 'object' ? body.siteMemory : null,
        fetchedAt: typeof body.fetchedAt === 'string' ? body.fetchedAt : new Date().toISOString(),
      }
    },
    keyVerifier({ cacheSeconds = 60 } = {}) {
      return async (key: string) => {
        const hit = keyCache.get(key)
        if (hit && hit.until > Date.now()) return hit.value
        let value: ApiKeyIdentity | null = null
        try {
          const body = (await (await call('/v1/sdk/agent-keys/verify', { key })).json()) as {
            valid?: boolean
            agentId?: string
            name?: string
            vendor?: string | null
          }
          if (body.valid && body.agentId) {
            value = { agentId: body.agentId }
            if (body.name) value.name = body.name
            if (body.vendor) value.vendor = body.vendor
          }
        } catch {
          // Console unreachable: serve a cached answer if we had one, else "unknown key".
          if (hit) return hit.value
          return null
        }
        if (keyCache.size > 5000) keyCache.delete(keyCache.keys().next().value as string)
        keyCache.set(key, { value, until: Date.now() + cacheSeconds * 1000 })
        return value
      }
    },
  }
}

/** Preferred name. Streams SDK traces to the Agentronics dashboard. */
export const createDashboardExporter = createIntelExporter
/** Preferred name for createIntelSync. */
export const createDashboardSync = createIntelSync
