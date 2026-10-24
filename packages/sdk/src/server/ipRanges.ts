/**
 * Published crawler IP ranges.
 *
 * Most AI crawlers (GPTBot, ChatGPT-User, PerplexityBot, …) don't support
 * reverse-DNS verification — instead the vendor publishes the CIDR blocks its
 * crawler uses as JSON (`{ prefixes: [{ ipv4Prefix } | { ipv6Prefix }] }`).
 * A User-Agent claim plus a client IP inside the vendor's published ranges is
 * a verified crawler. Unlike rDNS this needs only `fetch`, so it also works on
 * edge runtimes.
 */

/** Vendor range lists, keyed by crawler signature name. Fixed, vendor-owned URLs. */
export const PUBLISHED_IP_RANGES: Record<string, string[]> = {
  GPTBot: ['https://openai.com/gptbot.json'],
  'OAI-SearchBot': ['https://openai.com/searchbot.json'],
  'ChatGPT-User': ['https://openai.com/chatgpt-user.json'],
  PerplexityBot: ['https://www.perplexity.ai/perplexitybot.json'],
  'Perplexity-User': ['https://www.perplexity.ai/perplexity-user.json'],
  Googlebot: ['https://developers.google.com/static/crawling/ipranges/common-crawlers.json'],
  Bingbot: ['https://www.bing.com/toolbox/bingbot.json'],
  DuckDuckBot: ['https://duckduckgo.com/duckduckbot.json'],
  CCBot: ['https://index.commoncrawl.org/ccbot.json'],
}

export interface IpRangeOptions {
  /** Static CIDR lists per crawler name; replaces the fetched lists for those names. */
  ipRanges?: Record<string, string[]>
  /** Test seam. */
  fetcher?: typeof fetch
}

const TTL_MS = 24 * 3600_000
const FAILED_TTL_MS = 10 * 60_000
const cache = new Map<string, { cidrs: string[]; until: number }>()
export const __clearIpRangeCache = () => cache.clear()

async function loadUrl(url: string, fetcher: typeof fetch): Promise<string[]> {
  const hit = cache.get(url)
  if (hit && hit.until > Date.now()) return hit.cidrs
  try {
    const res = await fetcher(url, { signal: AbortSignal.timeout(5000), redirect: 'follow' })
    if (!res.ok) throw new Error(String(res.status))
    const body = (await res.json()) as { prefixes?: Array<{ ipv4Prefix?: string; ipv6Prefix?: string }> }
    const cidrs = (body.prefixes ?? []).flatMap((p) => [p.ipv4Prefix, p.ipv6Prefix]).filter((c): c is string => typeof c === 'string')
    cache.set(url, { cidrs, until: Date.now() + TTL_MS })
    return cidrs
  } catch {
    // Keep serving a stale list if we had one; otherwise remember the failure briefly.
    const cidrs = hit?.cidrs ?? []
    cache.set(url, { cidrs, until: Date.now() + FAILED_TTL_MS })
    return cidrs
  }
}

/** The CIDR list for a crawler, or null when the vendor publishes none. */
export async function rangesFor(name: string, options: IpRangeOptions = {}): Promise<string[] | null> {
  const fixed = options.ipRanges?.[name]
  if (fixed) return fixed
  const urls = PUBLISHED_IP_RANGES[name]
  if (!urls) return null
  const fetcher = options.fetcher ?? fetch
  return (await Promise.all(urls.map((u) => loadUrl(u, fetcher)))).flat()
}

// ---- CIDR matching -------------------------------------------------------------

function v4ToBigInt(ip: string): bigint | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  let n = 0n
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p) || Number(p) > 255) return null
    n = (n << 8n) | BigInt(p)
  }
  return n
}

function v6ToBigInt(ip: string): bigint | null {
  let s = ip.toLowerCase().replace(/^\[|\]$/g, '')
  const zone = s.indexOf('%')
  if (zone >= 0) s = s.slice(0, zone)
  // Embedded IPv4 tail (::ffff:1.2.3.4)
  const v4 = s.match(/(\d+\.\d+\.\d+\.\d+)$/)
  if (v4) {
    const n = v4ToBigInt(v4[1]!)
    if (n === null) return null
    s = s.slice(0, -v4[1]!.length) + ((n >> 16n) & 0xffffn).toString(16) + ':' + (n & 0xffffn).toString(16)
  }
  const halves = s.split('::')
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(':') : []
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const missing = 8 - head.length - tail.length
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill('0'), ...tail]
  let n = 0n
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null
    n = (n << 16n) | BigInt(parseInt(g, 16))
  }
  return n
}

/** True when `ip` (v4 or v6) falls inside `cidr`. Mismatched families never match. */
export function ipInCidr(ip: string, cidr: string): boolean {
  const [range, bitsRaw] = cidr.split('/')
  if (!range) return false
  const isV6 = range.includes(':')
  // An IPv4-mapped IPv6 client address (::ffff:a.b.c.d) is matched as IPv4.
  const mapped = ip.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  const candidate = !isV6 && mapped ? mapped[1]! : ip
  const width = isV6 ? 128 : 32
  const bits = bitsRaw === undefined ? width : Number(bitsRaw)
  if (!Number.isInteger(bits) || bits < 0 || bits > width) return false
  const a = isV6 ? v6ToBigInt(candidate) : v4ToBigInt(candidate)
  const b = isV6 ? v6ToBigInt(range) : v4ToBigInt(range)
  if (a === null || b === null) return false
  const shift = BigInt(width - bits)
  return a >> shift === b >> shift
}

export const ipInRanges = (ip: string, cidrs: string[]) => cidrs.some((c) => ipInCidr(ip, c))
