import type { AgentIdentity } from '@agentronics/protocol'
import { SDK_VERSION } from '../version.js'

export type CrawlerCategory = 'ai' | 'search'

export interface CrawlerSignature {
  /** Stable vendor id, reported as identity.vendor. */
  name: string
  category: CrawlerCategory
  /** Tested against navigator.userAgent. */
  pattern: RegExp
}

/**
 * Known AI + search crawlers, matched by User-Agent token.
 *
 * Caveats baked into the design:
 * - UA is self-reported and trivially spoofable, so a match is high-confidence
 *   but never certain — we report `confidence: 0.9`, not `1`.
 * - This is client-side detection: it only sees crawlers that actually execute
 *   JavaScript on the page. The majority of crawlers fetch HTML and never run
 *   the SDK, so full coverage needs server/edge UA inspection (a future product).
 *
 * Order matters: more specific tokens (e.g. `Google-Extended`, `Applebot-Extended`)
 * are listed before their broader siblings so the first match wins correctly.
 */
export const CRAWLER_SIGNATURES: CrawlerSignature[] = [
  // AI / LLM crawlers
  { name: 'GPTBot', category: 'ai', pattern: /GPTBot/i },
  { name: 'OAI-SearchBot', category: 'ai', pattern: /OAI-SearchBot/i },
  { name: 'ChatGPT-User', category: 'ai', pattern: /ChatGPT-User/i },
  { name: 'ClaudeBot', category: 'ai', pattern: /ClaudeBot/i },
  { name: 'Claude-Web', category: 'ai', pattern: /Claude-Web/i },
  { name: 'anthropic-ai', category: 'ai', pattern: /anthropic-ai/i },
  { name: 'PerplexityBot', category: 'ai', pattern: /PerplexityBot/i },
  { name: 'Google-Extended', category: 'ai', pattern: /Google-Extended/i },
  { name: 'Applebot-Extended', category: 'ai', pattern: /Applebot-Extended/i },
  { name: 'Amazonbot', category: 'ai', pattern: /Amazonbot/i },
  { name: 'Bytespider', category: 'ai', pattern: /Bytespider/i },
  { name: 'CCBot', category: 'ai', pattern: /CCBot/i },
  { name: 'Meta-ExternalAgent', category: 'ai', pattern: /Meta-ExternalAgent/i },
  { name: 'cohere-ai', category: 'ai', pattern: /cohere-ai/i },
  // Search crawlers
  { name: 'Googlebot', category: 'search', pattern: /Googlebot/i },
  { name: 'Bingbot', category: 'search', pattern: /bingbot/i },
  { name: 'DuckDuckBot', category: 'search', pattern: /DuckDuckBot/i },
  { name: 'YandexBot', category: 'search', pattern: /YandexBot/i },
  { name: 'Baiduspider', category: 'search', pattern: /Baiduspider/i },
  { name: 'Applebot', category: 'search', pattern: /Applebot/i },
]

export interface DetectCrawlerOptions {
  /** Override the signature table (e.g. to add private/first-party crawlers). */
  signatures?: CrawlerSignature[]
  /** Skip crawler detection entirely. */
  disable?: boolean
  /** Confidence reported on a UA match. Default 0.9 (UA is spoofable). */
  confidence?: number
}

/**
 * Identify known AI/search crawlers by their User-Agent token. Returns `null`
 * when no signature matches or when there is no `navigator` (server-side).
 */
export const detectCrawler = (options: DetectCrawlerOptions = {}): AgentIdentity | null => {
  const { signatures = CRAWLER_SIGNATURES, disable = false, confidence = 0.9 } = options
  if (disable) return null
  if (typeof navigator === 'undefined') return null

  const ua = navigator.userAgent ?? ''
  if (!ua) return null

  for (const sig of signatures) {
    if (sig.pattern.test(ua)) {
      return {
        class: 'crawler',
        trust: 'detected',
        confidence,
        vendor: sig.name,
        userAgent: ua,
        detectionVersion: SDK_VERSION,
        signals: { matched: sig.name, category: sig.category, ua },
      }
    }
  }

  return null
}
