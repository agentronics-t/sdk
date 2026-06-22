import { z } from 'zod'

/**
 * A single governed tool as surfaced to agents — the wire shape the SDK pushes
 * to the gateway and the dashboard renders. `tokens` is the SDK's estimate of
 * how much of an agent's context the descriptor occupies; `page` is the
 * progression stage / page the tool belongs to (used for page-wise grouping).
 */
export const ToolDescriptor = z.object({
  name: z.string().min(1),
  group: z.string().optional(),
  page: z.string().optional(),
  description: z.string().default(''),
  inputSchema: z.record(z.unknown()).default({}),
  outputSchema: z.record(z.unknown()).optional(),
  tokens: z.number().int().nonnegative().default(0),
})
export type ToolDescriptor = z.infer<typeof ToolDescriptor>

/** The full registry the SDK syncs for a site. */
export const ToolRegistry = z.object({
  tools: z.array(ToolDescriptor).default([]),
})
export type ToolRegistry = z.infer<typeof ToolRegistry>

export const TOOL_REGISTRY_DEFAULT: ToolRegistry = ToolRegistry.parse({})
