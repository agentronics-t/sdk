import { Hono } from 'hono'
import { z } from 'zod'
import { apiKeyAuth } from '../middleware/apiKeyAuth.js'
import { eitherAuth, clerkAuth, type ClerkAuthOptions } from '../middleware/clerkAuth.js'
import type { AuditEntry, Storage } from '../storage/types.js'

const Body = z.object({ format: z.enum(['json', 'csv']).default('json') })

const csvEscape = (value: unknown): string => {
  const raw =
    value === null || value === undefined
      ? ''
      : typeof value === 'string'
        ? value
        : JSON.stringify(value)
  // Prefix a single quote to neutralize Excel/Sheets formula execution when
  // an audit field starts with =, +, -, @, tab, or CR. Audit fields come
  // from tool names, siteIds, and user-supplied metadata, all of which are
  // attacker-controllable.
  const text = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

const renderCsv = (entries: AuditEntry[]): string => {
  const header = ['id', 'orgId', 'actor', 'action', 'target', 'metadata', 'occurredAt']
  const rows = entries.map((entry) =>
    [entry.id, entry.orgId, entry.actor, entry.action, entry.target, entry.metadata, entry.occurredAt]
      .map(csvEscape)
      .join(',')
  )
  return [header.join(','), ...rows].join('\n')
}

export const createAuditRoutes = ({
  storage,
  resolveSession,
}: {
  storage: Storage
  resolveSession: ClerkAuthOptions['resolveSession']
}) => {
  const app = new Hono()

  app.post(
    '/v1/audit/export',
    eitherAuth(apiKeyAuth({ storage, scopes: ['secret'] }), clerkAuth({ resolveSession })),
    async (c) => {
      const auth = c.get('auth')
      const parsed = Body.safeParse(await c.req.json().catch(() => ({})))
      if (!parsed.success) {
        return c.json({ error: 'invalid_body', issues: parsed.error.issues }, 400)
      }
      const entries = await storage.audit.list(auth.orgId)
      if (parsed.data.format === 'csv') {
        c.header('content-type', 'text/csv; charset=utf-8')
        c.header('content-disposition', `attachment; filename="audit-${auth.orgId}.csv"`)
        return c.body(renderCsv(entries))
      }
      c.header('content-disposition', `attachment; filename="audit-${auth.orgId}.json"`)
      return c.json({ entries })
    }
  )

  return app
}
