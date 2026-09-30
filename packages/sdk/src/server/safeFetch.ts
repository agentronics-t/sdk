/**
 * SSRF-guarded fetch for attacker-supplied URLs (the Web Bot Auth
 * `Signature-Agent` value comes from an untrusted request header).
 *
 * Guards: HTTPS on port 443 only, no credentials in the URL, no IP-literal or
 * internal hostnames (localhost, *.local, *.internal, *.home.arpa, private /
 * loopback / link-local / CGNAT / multicast ranges), no redirects (spec:
 * non-200 is a discovery failure), a timeout, and a response size cap.
 *
 * On Node, `resolveDns: true` also resolves the hostname and rejects private
 * addresses. Residual risk: DNS rebinding between that check and the fetch —
 * restrict `allowedDirectories` to known signers if that matters to you.
 */

export class UnsafeUrlError extends Error {}

const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.home.arpa', '.lan', '.corp', '.intranet']

export function isPrivateIpv4(ip: string): boolean {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m) return false
  const [a, b] = [Number(m[1]), Number(m[2])]
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local / cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224 // multicast + reserved
  )
}

export function isPrivateIpv6(ip: string): boolean {
  const s = ip.toLowerCase().replace(/^\[|\]$/g, '')
  if (s === '::' || s === '::1') return true
  const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return isPrivateIpv4(mapped[1]!)
  return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(s) // ULA, link-local, multicast
}

const isIpLiteral = (host: string) => /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':') || host.startsWith('[')

/** Throws UnsafeUrlError unless `raw` is a safe public HTTPS URL. */
export function assertSafeUrl(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new UnsafeUrlError('invalid URL')
  }
  if (url.protocol !== 'https:') throw new UnsafeUrlError('HTTPS required')
  if (url.username || url.password) throw new UnsafeUrlError('credentials in URL')
  if (url.port && url.port !== '443') throw new UnsafeUrlError('non-standard port')
  const host = url.hostname.toLowerCase()
  if (isIpLiteral(host)) throw new UnsafeUrlError('IP-literal hosts are not allowed')
  if (host === 'localhost' || !host.includes('.') || BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) {
    throw new UnsafeUrlError('internal hostname')
  }
  return url
}

export interface SafeFetchOptions {
  fetch?: typeof fetch
  timeoutMs?: number
  maxBytes?: number
  accept?: string
  /** Node only: resolve the host and reject private addresses before fetching. */
  resolveDns?: boolean
}

export interface SafeFetchResult {
  status: number
  headers: Headers
  body: string
}

interface NodeDnsLookup {
  lookup(host: string, opts: { all: true }): Promise<Array<{ address: string; family: number }>>
}

async function assertPublicDns(host: string): Promise<void> {
  let dns: NodeDnsLookup
  try {
    dns = (await import(/* webpackIgnore: true */ /* @vite-ignore */ 'node:dns/promises' as string)) as NodeDnsLookup
  } catch {
    return // not on Node (edge/workers) — hostname checks only
  }
  const addrs = await dns.lookup(host, { all: true }).catch(() => {
    throw new UnsafeUrlError('DNS lookup failed')
  })
  for (const { address, family } of addrs) {
    if (family === 4 ? isPrivateIpv4(address) : isPrivateIpv6(address)) {
      throw new UnsafeUrlError('host resolves to a private address')
    }
  }
}

export async function safeFetch(raw: string, opts: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const url = assertSafeUrl(raw)
  if (opts.resolveDns) await assertPublicDns(url.hostname)
  const doFetch = opts.fetch ?? fetch
  const res = await doFetch(url.href, {
    method: 'GET',
    redirect: 'manual',
    headers: { accept: opts.accept ?? 'application/json' },
    signal: AbortSignal.timeout(opts.timeoutMs ?? 3000),
  })
  const maxBytes = opts.maxBytes ?? 64 * 1024
  const declared = Number(res.headers.get('content-length') ?? 0)
  if (declared > maxBytes) throw new UnsafeUrlError('response too large')
  // Read with a hard cap (content-length can lie or be absent).
  const reader = res.body?.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined)
        throw new UnsafeUrlError('response too large')
      }
      chunks.push(value)
    }
  }
  const body = new Uint8Array(total)
  let o = 0
  for (const c of chunks) {
    body.set(c, o)
    o += c.byteLength
  }
  return { status: res.status, headers: res.headers, body: new TextDecoder().decode(body) }
}
