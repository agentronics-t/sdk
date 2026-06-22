import 'server-only'
import type { SiteMemory } from '@agentronics/protocol'

export interface MemoryScore {
  score: number // 0–100
  source: 'ai' | 'heuristic'
  breakdown: { label: string; present: boolean }[]
  suggestions: string[]
}

const vertexConfigured = (): boolean =>
  Boolean(
    process.env.GCP_PROJECT &&
      (process.env.GOOGLE_GENAI_SA_KEY || process.env.GOOGLE_APPLICATION_CREDENTIALS)
  )

/** Always-available completeness score from structural signals. */
function heuristic(memory: SiteMemory): MemoryScore {
  const breakdown = [
    { label: 'Site map pages', present: (memory.siteMap?.pages?.length ?? 0) > 0 },
    { label: 'Navigation flow', present: Boolean(memory.siteMap?.navigation) },
    { label: 'Workflows', present: Object.keys(memory.workflows ?? {}).length > 0 },
    { label: 'Business policies', present: Object.keys(memory.policies ?? {}).length > 0 },
    { label: 'UI guidance', present: Object.keys(memory.uiGuidance ?? {}).length > 0 },
    { label: 'Per-page context', present: Object.keys(memory.pageContexts ?? {}).length > 0 },
  ]
  const present = breakdown.filter((c) => c.present).length
  const score = Math.round((present / breakdown.length) * 100)
  const suggestions = breakdown
    .filter((c) => !c.present)
    .map((c) => `Add ${c.label.toLowerCase()} so agents have richer context.`)
  return { score, source: 'heuristic', breakdown, suggestions }
}

/**
 * Score a site-memory snapshot for how useful it is to an AI agent. Uses Vertex
 * Gemini when configured (SA key or ADC), otherwise the deterministic heuristic
 * — so the dashboard always renders a score, with AI when available.
 */
export async function scoreSiteMemory(memory: SiteMemory): Promise<MemoryScore> {
  const base = heuristic(memory)
  if (!vertexConfigured()) return base
  try {
    const { GoogleGenAI } = await import('@google/genai')
    const key = process.env.GOOGLE_GENAI_SA_KEY
    const ai = new GoogleGenAI({
      vertexai: true,
      project: process.env.GCP_PROJECT as string,
      location: process.env.VERTEX_LOCATION || 'asia-south1',
      ...(key ? { googleAuthOptions: { credentials: JSON.parse(key) } } : {}),
    })
    const prompt =
      `Rate this site-memory snapshot (0-100) for how useful it is to an AI agent ` +
      `navigating the site — weigh completeness, clarity, and actionability. ` +
      `Reply as JSON {"score": number, "suggestions": string[]} with up to 5 concrete suggestions.\n\n` +
      JSON.stringify(memory).slice(0, 8000)
    const res = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json', temperature: 0.2, maxOutputTokens: 512 },
    })
    const parsed = JSON.parse(res.text || '{}') as { score?: number; suggestions?: unknown }
    if (typeof parsed.score === 'number') {
      return {
        score: Math.max(0, Math.min(100, Math.round(parsed.score))),
        source: 'ai',
        breakdown: base.breakdown,
        suggestions: Array.isArray(parsed.suggestions)
          ? (parsed.suggestions as string[]).slice(0, 6)
          : base.suggestions,
      }
    }
  } catch {
    // fall through to heuristic
  }
  return base
}
