/**
 * Server-side crawler identification + verification.
 *
 * A User-Agent claim is trivially spoofable, so on its own it only makes a
 * request "claimed". A claim becomes verified by forward-confirmed reverse DNS
 * (the IP's PTR name sits under the vendor's documented domain AND resolves
 * back to the same IP) — the method Google, Microsoft, Apple, Yandex, Baidu and
 * Amazon document for their crawlers. Needs Node DNS; on edge runtimes the
 * claim stays unverified (use Web Bot Auth, which works everywhere).
 */
import { CRAWLER_SIGNATURES, type CrawlerSignature } from '../detection/crawler.js'

/** Vendors that document reverse-DNS verification, keyed by signature name. */
export const RDNS_DOMAINS: Record<string, string[]> = {
  Googlebot: ['googlebot.com', 'google.com', 'googleusercontent.com'],
  Bingbot: ['search.msn.com'],
  Applebot: ['applebot.apple.com'],
  'Applebot-Extended': ['applebot.apple.com'],
  YandexBot: ['yandex.ru', 'yandex.net', 'yandex.com'],
  Baiduspider: ['baidu.com', 'baidu.jp'],
  Amazonbot: ['crawl.amazonbot.amazon'],
}

export interface CrawlerClaim {
  name: string
  category: CrawlerSignature['category']
}

export function classifyUserAgent(ua: string | null, signatures = CRAWLER_SIGNATURES): CrawlerClaim | null {
  if (!ua) return null
  const hit = signatures.find((s) => s.pattern.test(ua))
  return hit ? { name: hit.name, category: hit.category } : null
}

/**
 * Where the real client IP comes from. Platform headers are set by the edge
 * and can't be spoofed by the caller; the leftmost X-Forwarded-For entry CAN,
 * so it's never used by default.
 */
export type ClientIpSource = 'auto' | 'cloudflare' | 'vercel' | ((request: Request) => string | null)

export function clientIp(request: Request, source: ClientIpSource = 'auto'): string | null {
  if (typeof source === 'function') return source(request)
  const h = request.headers
  if (source === 'cloudflare') return h.get('cf-connecting-ip')
  if (source === 'vercel') return h.get('x-real-ip') ?? h.get('x-vercel-forwarded-for')
  return h.get('cf-connecting-ip') ?? h.get('x-real-ip') ?? h.get('x-vercel-forwarded-for')
}

export interface DnsResolver {
  reverse(ip: string): Promise<string[]>
  lookup(host: string): Promise<string[]>
}

/** The two node:dns/promises calls we use — typed locally so edge builds need no @types/node. */
interface NodeDnsPromises {
  reverse(ip: string): Promise<string[]>
  lookup(host: string, opts: { all: true }): Promise<Array<{ address: string; family: number }>>
}

async function nodeResolver(): Promise<DnsResolver | null> {
  try {
    const dns = (await import(/* webpackIgnore: true */ /* @vite-ignore */ 'node:dns/promises' as string)) as NodeDnsPromises
    return {
      reverse: (ip) => dns.reverse(ip),
      lookup: async (host) => (await dns.lookup(host, { all: true })).map((a) => a.address),
    }
  } catch {
    return null
  }
}

const rdnsCache = new Map<string, { ok: boolean; host?: string; until: number }>()
export const __clearRdnsCache = () => rdnsCache.clear()

export type CrawlerVerification =
  | { status: 'verified'; name: string; host: string; ip: string }
  | { status: 'unverified'; name: string; reason: string }

export async function verifyCrawler(
  claim: CrawlerClaim,
  ip: string | null,
  resolver?: DnsResolver
): Promise<CrawlerVerification> {
  const domains = RDNS_DOMAINS[claim.name]
  if (!domains) return { status: 'unverified', name: claim.name, reason: 'no_rdns_method_for_vendor' }
  if (!ip) return { status: 'unverified', name: claim.name, reason: 'client_ip_unknown' }

  const key = `${claim.name}|${ip}`
  const hit = rdnsCache.get(key)
  if (hit && hit.until > Date.now()) {
    return hit.ok
      ? { status: 'verified', name: claim.name, host: hit.host!, ip }
      : { status: 'unverified', name: claim.name, reason: 'rdns_mismatch' }
  }

  const dns = resolver ?? (await nodeResolver())
  if (!dns) return { status: 'unverified', name: claim.name, reason: 'dns_unavailable_in_runtime' }

  const remember = (ok: boolean, host?: string) => {
    if (rdnsCache.size > 5000) rdnsCache.delete(rdnsCache.keys().next().value as string)
    rdnsCache.set(key, { ok, ...(host ? { host } : {}), until: Date.now() + (ok ? 3600_000 : 600_000) })
  }
  try {
    const names = await dns.reverse(ip)
    for (const name of names) {
      const host = name.toLowerCase().replace(/\.$/, '')
      if (!domains.some((d) => host === d || host.endsWith(`.${d}`))) continue
      const forward = await dns.lookup(host)
      if (forward.includes(ip)) {
        remember(true, host)
        return { status: 'verified', name: claim.name, host, ip }
      }
    }
    remember(false)
    return { status: 'unverified', name: claim.name, reason: 'rdns_mismatch' }
  } catch {
    return { status: 'unverified', name: claim.name, reason: 'rdns_lookup_failed' }
  }
}
