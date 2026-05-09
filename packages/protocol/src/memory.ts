import { z } from 'zod'

// ---- Key-value memory (existing surface) -------------------------------------

export const MemoryScope = z.enum(['session', 'user', 'org'])
export type MemoryScope = z.infer<typeof MemoryScope>

export const MemoryEntry = z.object({
  key: z.string().min(1),
  value: z.unknown(),
  scope: MemoryScope.default('session'),
  ttlSeconds: z.number().int().positive().nullable().default(null),
  updatedAt: z.string().datetime().optional(),
})
export type MemoryEntry = z.infer<typeof MemoryEntry>

// ---- Site memory (Phase 5: enterprise-provided context for agents) ----------

export const SiteMemoryPage = z.object({
  path: z.string().min(1),
  name: z.string().optional(),
  purpose: z.string().optional(),
  availableActions: z.array(z.string()).optional(),
  prerequisites: z.array(z.string()).optional(),
  queryParams: z.record(z.string()).optional(),
  notes: z.string().optional(),
})
export type SiteMemoryPage = z.infer<typeof SiteMemoryPage>

export const SiteMemoryNavigation = z.object({
  pattern: z.string().optional(),
  flow: z.string().optional(),
})

export const SiteMemorySiteMap = z.object({
  pages: z.array(SiteMemoryPage).default([]),
  navigation: SiteMemoryNavigation.optional(),
})

export const SiteMemoryWorkflowStep = z.object({
  step: z.number().int().positive(),
  action: z.string().min(1),
})

export const SiteMemoryWorkflow = z.object({
  steps: z.array(SiteMemoryWorkflowStep).default([]),
  notes: z.string().optional(),
  policy: z.string().optional(),
})
export type SiteMemoryWorkflow = z.infer<typeof SiteMemoryWorkflow>

export const SiteMemoryUiHint = z.object({
  selector: z.string().min(1),
  behavior: z.string().optional(),
  location: z.string().optional(),
  showsCount: z.boolean().optional(),
})
export type SiteMemoryUiHint = z.infer<typeof SiteMemoryUiHint>

export const SiteMemoryCatalog = z.object({
  categories: z.array(z.string()).optional(),
  productSchema: z
    .object({
      fields: z.array(z.string()).optional(),
      idFormat: z.string().optional(),
    })
    .optional(),
  searchBehavior: z.string().optional(),
})

export const SiteMemoryPageContext = z
  .object({
    path: z.string().min(1),
    payload: z.record(z.unknown()).default({}),
    updatedAt: z.string().datetime().optional(),
  })
  .strict()
export type SiteMemoryPageContext = z.infer<typeof SiteMemoryPageContext>

export const SiteMemory = z.object({
  version: z.string().default('1'),
  siteMap: SiteMemorySiteMap.optional(),
  workflows: z.record(SiteMemoryWorkflow).default({}),
  policies: z.record(z.union([z.string(), z.array(z.string())])).default({}),
  catalog: SiteMemoryCatalog.optional(),
  uiGuidance: z.record(SiteMemoryUiHint).default({}),
  pageContexts: z.record(SiteMemoryPageContext).default({}),
  updatedAt: z.string().datetime().optional(),
})
export type SiteMemory = z.infer<typeof SiteMemory>

export const SITE_MEMORY_DEFAULT: SiteMemory = SiteMemory.parse({})
