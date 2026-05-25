// Parser for Envoy's x-forwarded-client-cert (XFCC) header.
// Spec: entries are comma-separated; key/value pairs within an entry are
// semicolon-separated; values containing reserved characters are double-
// quoted; `Cert` and `Chain` are URL-encoded PEM blocks. URI and DNS may
// repeat. We extract the fields the verifier needs and discard the rest.

export interface XfccEntry {
  by?: string
  hash?: string
  cert?: string // decoded PEM
  chain?: string // decoded PEM(s)
  subject?: string
  uri: string[]
  dns: string[]
}

const stripQuotes = (raw: string): string => {
  if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) {
    return raw.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  }
  return raw
}

// Split on the given separator at depth-0 (outside double quotes).
const splitTopLevel = (input: string, separator: string): string[] => {
  const out: string[] = []
  let depth = 0
  let buf = ''
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!
    if (ch === '"' && input[i - 1] !== '\\') depth ^= 1
    if (ch === separator && depth === 0) {
      out.push(buf.trim())
      buf = ''
    } else {
      buf += ch
    }
  }
  if (buf.trim()) out.push(buf.trim())
  return out
}

const parseEntry = (raw: string): XfccEntry => {
  const entry: XfccEntry = { uri: [], dns: [] }
  for (const pair of splitTopLevel(raw, ';')) {
    const eq = pair.indexOf('=')
    if (eq < 0) continue
    const key = pair.slice(0, eq).toLowerCase().trim()
    const value = stripQuotes(pair.slice(eq + 1).trim())
    switch (key) {
      case 'by':
        // `by` is advisory — it identifies the proxy that injected the
        // header but is never trusted for authn/authz decisions. Only
        // the cert + chain are verified downstream.
        entry.by = value
        break
      case 'hash':
        entry.hash = value
        break
      case 'cert':
        entry.cert = decodeURIComponent(value)
        break
      case 'chain':
        entry.chain = decodeURIComponent(value)
        break
      case 'subject':
        entry.subject = value
        break
      case 'uri':
        entry.uri.push(value)
        break
      case 'dns':
        entry.dns.push(value)
        break
      default:
        // Unknown keys are ignored — Envoy may add fields in newer versions.
        break
    }
  }
  return entry
}

export const parseXfcc = (header: string): XfccEntry[] =>
  splitTopLevel(header, ',').map(parseEntry)

export type XfccEntryPolicy = 'last' | 'first' | 'only'

export const selectXfccEntry = (
  entries: XfccEntry[],
  policy: XfccEntryPolicy
): XfccEntry => {
  if (entries.length === 0) throw new Error('xfcc_no_entries')
  if (policy === 'only' && entries.length !== 1) {
    throw new Error('xfcc_multiple_entries_under_only_policy')
  }
  if (policy === 'first') return entries[0]!
  return entries[entries.length - 1]!
}
