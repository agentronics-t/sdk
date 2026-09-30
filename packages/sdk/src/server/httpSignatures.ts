/**
 * HTTP Message Signatures (RFC 9421) — request verification only.
 * Runtime-neutral: WebCrypto + Fetch `Request`, so it runs on Node ≥ 20,
 * Vercel/Next edge middleware, Cloudflare Workers, Deno and Bun.
 */
import {
  type InnerList,
  type Item,
  SfParseError,
  bytesToBase64Url,
  getParam,
  isInnerList,
  parseDictionary,
  serializeInnerList,
  serializeItem,
  serializeMember,
} from './structuredFields.js'

export class SignatureError extends Error {
  constructor(
    readonly code: string,
    message?: string
  ) {
    super(message ?? code)
  }
}

export interface ComponentContext {
  request: Request
  url: URL
  /** Override for `@authority` (e.g. when a proxy rewrites Host). */
  authority?: string
}

const DERIVED = new Set([
  '@method',
  '@target-uri',
  '@authority',
  '@scheme',
  '@request-target',
  '@path',
  '@query',
  '@query-param',
])

/** Value of one covered component, per RFC 9421 §2.1 / §2.2. */
export function componentValue(id: Item, ctx: ComponentContext): string {
  if (typeof id.value !== 'string') throw new SignatureError('invalid_component', 'component id must be a string')
  const name = id.value
  const { url } = ctx

  if (name.startsWith('@')) {
    if (!DERIVED.has(name)) throw new SignatureError('unsupported_component', name)
    switch (name) {
      case '@method':
        return ctx.request.method.toUpperCase()
      case '@target-uri':
        return url.href
      case '@authority':
        return (ctx.authority ?? url.host).toLowerCase()
      case '@scheme':
        return url.protocol.replace(/:$/, '').toLowerCase()
      case '@request-target':
        return url.pathname + url.search
      case '@path':
        return url.pathname || '/'
      case '@query':
        return url.search || '?'
      case '@query-param': {
        const pname = getParam(id.params, 'name')
        if (typeof pname !== 'string') throw new SignatureError('invalid_component', '@query-param needs name')
        const values = url.searchParams.getAll(pname)
        if (values.length !== 1) throw new SignatureError('invalid_component', `@query-param ${pname}`)
        return encodeURIComponent(values[0]!)
      }
    }
  }

  // HTTP field component
  // Only `;key` (dictionary member) is supported. `;sf` needs the field's
  // structured type (not knowable generically); `;bs`, `;req`, `;tr` don't
  // apply to Web Bot Auth. Reject rather than guess.
  for (const [k] of id.params) {
    if (k !== 'key') throw new SignatureError('unsupported_component', `param ${k}`)
  }
  const raw = ctx.request.headers.get(name)
  if (raw === null) throw new SignatureError('missing_component', name)
  const value = raw.trim()

  const key = getParam(id.params, 'key')
  if (typeof key === 'string') {
    let dict
    try {
      dict = parseDictionary(value)
    } catch (e) {
      throw new SignatureError('invalid_component', `${name} is not a dictionary: ${(e as Error).message}`)
    }
    const member = dict.get(key)
    if (!member) throw new SignatureError('missing_component', `${name};key=${key}`)
    return serializeMember(member)
  }
  return value
}

/** Build the signature base (RFC 9421 §2.5) for one Signature-Input member. */
export function signatureBase(input: InnerList, ctx: ComponentContext): string {
  const seen = new Set<string>()
  const lines: string[] = []
  for (const id of input.items) {
    const ident = serializeItem(id)
    if (seen.has(ident)) throw new SignatureError('duplicate_component', ident)
    seen.add(ident)
    lines.push(`${ident}: ${componentValue(id, ctx)}`)
  }
  lines.push(`"@signature-params": ${serializeInnerList(input)}`)
  return lines.join('\n')
}

// ---- keys + algorithms ----------------------------------------------------

export interface PublicJwk {
  kty: string
  crv?: string
  x?: string
  y?: string
  n?: string
  e?: string
  kid?: string
  alg?: string
  use?: string
  nbf?: number
  exp?: number
}

export type SignatureAlgorithm =
  | 'ed25519'
  | 'rsa-pss-sha512'
  | 'rsa-v1_5-sha256'
  | 'ecdsa-p256-sha256'
  | 'ecdsa-p384-sha384'

const ALGS: Record<
  SignatureAlgorithm,
  { kty: string; crv?: string; importAlg: Parameters<SubtleCrypto['importKey']>[2]; verifyAlg: Parameters<SubtleCrypto['verify']>[0] }
> = {
  ed25519: { kty: 'OKP', crv: 'Ed25519', importAlg: { name: 'Ed25519' }, verifyAlg: { name: 'Ed25519' } },
  'rsa-pss-sha512': {
    kty: 'RSA',
    importAlg: { name: 'RSA-PSS', hash: 'SHA-512' },
    verifyAlg: { name: 'RSA-PSS', saltLength: 64 },
  },
  'rsa-v1_5-sha256': {
    kty: 'RSA',
    importAlg: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    verifyAlg: { name: 'RSASSA-PKCS1-v1_5' },
  },
  'ecdsa-p256-sha256': {
    kty: 'EC',
    crv: 'P-256',
    importAlg: { name: 'ECDSA', namedCurve: 'P-256' },
    verifyAlg: { name: 'ECDSA', hash: 'SHA-256' },
  },
  'ecdsa-p384-sha384': {
    kty: 'EC',
    crv: 'P-384',
    importAlg: { name: 'ECDSA', namedCurve: 'P-384' },
    verifyAlg: { name: 'ECDSA', hash: 'SHA-384' },
  },
}

/** Pick the algorithm: the `alg` parameter if present (must fit the key), else infer from the key. */
export function resolveAlgorithm(jwk: PublicJwk, algParam: unknown): SignatureAlgorithm {
  if (typeof algParam === 'string') {
    const spec = ALGS[algParam as SignatureAlgorithm]
    if (!spec) throw new SignatureError('unsupported_alg', algParam)
    if (spec.kty !== jwk.kty || (spec.crv && spec.crv !== jwk.crv)) {
      throw new SignatureError('alg_key_mismatch', `${algParam} vs ${jwk.kty}/${jwk.crv ?? ''}`)
    }
    return algParam as SignatureAlgorithm
  }
  if (jwk.kty === 'OKP' && jwk.crv === 'Ed25519') return 'ed25519'
  if (jwk.kty === 'EC' && jwk.crv === 'P-256') return 'ecdsa-p256-sha256'
  if (jwk.kty === 'EC' && jwk.crv === 'P-384') return 'ecdsa-p384-sha384'
  // RSA is ambiguous (PSS vs v1.5) — require an explicit alg.
  throw new SignatureError('alg_required', `cannot infer algorithm for ${jwk.kty}`)
}

export async function verifySignature(
  alg: SignatureAlgorithm,
  jwk: PublicJwk,
  base: string,
  signature: Uint8Array
): Promise<boolean> {
  const spec = ALGS[alg]
  const { kid: _kid, alg: _alg, use: _use, nbf: _nbf, exp: _exp, ...material } = jwk
  let key: CryptoKey
  try {
    key = await crypto.subtle.importKey('jwk', material as JsonWebKey, spec.importAlg, false, ['verify'])
  } catch (e) {
    throw new SignatureError('invalid_key', (e as Error).message)
  }
  // copy into a fresh ArrayBuffer-backed view (WebCrypto rejects SharedArrayBuffer views)
  return crypto.subtle.verify(spec.verifyAlg, key, new Uint8Array(signature), new TextEncoder().encode(base))
}

/** JWK SHA-256 thumbprint, base64url (RFC 7638; RFC 8037 §A.3 for OKP). */
export async function jwkThumbprint(jwk: PublicJwk): Promise<string> {
  let canonical: string
  if (jwk.kty === 'OKP') canonical = JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x })
  else if (jwk.kty === 'EC') canonical = JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y })
  else if (jwk.kty === 'RSA') canonical = JSON.stringify({ e: jwk.e, kty: jwk.kty, n: jwk.n })
  else throw new SignatureError('invalid_key', `unsupported kty ${jwk.kty}`)
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical))
  return bytesToBase64Url(new Uint8Array(digest))
}

export { SfParseError, isInnerList }
