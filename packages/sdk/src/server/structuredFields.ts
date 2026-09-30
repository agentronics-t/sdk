/**
 * Structured Field Values for HTTP (RFC 9651) — the subset HTTP Message
 * Signatures (RFC 9421) and Web Bot Auth need: Dictionaries, Inner Lists,
 * Items, Parameters; bare items of type Integer, Decimal, String, Token,
 * Byte Sequence and Boolean. Parsing is strict (invalid input throws), and
 * serialization is canonical, which RFC 9421 relies on for `@signature-params`.
 */

export class SfToken {
  constructor(readonly value: string) {}
}
export class SfDecimal {
  constructor(readonly value: number) {}
}
export type BareItem = string | number | boolean | Uint8Array | SfToken | SfDecimal
export type Params = Array<[string, BareItem]>
export interface Item {
  value: BareItem
  params: Params
}
export interface InnerList {
  items: Item[]
  params: Params
}
export type Member = Item | InnerList
export type Dictionary = Map<string, Member>

export const isInnerList = (m: Member): m is InnerList => 'items' in m

export class SfParseError extends Error {}

class Parser {
  i = 0
  constructor(private readonly s: string) {}
  get done() {
    return this.i >= this.s.length
  }
  peek() {
    return this.s[this.i] ?? ''
  }
  fail(what: string): never {
    throw new SfParseError(`${what} at ${this.i}`)
  }
  sp() {
    while (this.peek() === ' ') this.i++
  }
  ows() {
    while (this.peek() === ' ' || this.peek() === '\t') this.i++
  }

  key(): string {
    const c = this.peek()
    if (!/[a-z*]/.test(c)) this.fail('invalid key')
    let out = ''
    while (/[a-z0-9_\-.*]/.test(this.peek())) out += this.s[this.i++]
    return out
  }

  params(): Params {
    const out: Params = []
    while (this.peek() === ';') {
      this.i++
      this.sp()
      const k = this.key()
      let v: BareItem = true
      if (this.peek() === '=') {
        this.i++
        v = this.bareItem()
      }
      const existing = out.findIndex(([ek]) => ek === k)
      if (existing >= 0) out[existing] = [k, v]
      else out.push([k, v])
    }
    return out
  }

  bareItem(): BareItem {
    const c = this.peek()
    if (c === '-' || /[0-9]/.test(c)) return this.number()
    if (c === '"') return this.string()
    if (c === ':') return this.bytes()
    if (c === '?') return this.boolean()
    if (/[A-Za-z*]/.test(c)) return this.token()
    return this.fail('invalid bare item')
  }

  number(): number | SfDecimal {
    let sign = 1
    if (this.peek() === '-') {
      sign = -1
      this.i++
    }
    let num = ''
    let isDecimal = false
    while (!this.done) {
      const c = this.peek()
      if (/[0-9]/.test(c)) num += c
      else if (c === '.' && !isDecimal) {
        if (num.length > 12) this.fail('decimal integer part too long')
        isDecimal = true
        num += c
      } else break
      this.i++
      if (!isDecimal && num.length > 15) this.fail('integer too long')
      if (isDecimal && num.length > 16) this.fail('decimal too long')
    }
    if (!/[0-9]/.test(num[0] ?? '')) this.fail('invalid number')
    if (isDecimal) {
      if (num.endsWith('.')) this.fail('decimal ends with dot')
      if (num.split('.')[1]!.length > 3) this.fail('decimal fraction too long')
      return new SfDecimal(sign * Number(num))
    }
    return sign * Number(num)
  }

  string(): string {
    this.i++ // opening quote
    let out = ''
    while (!this.done) {
      const c = this.s[this.i++]!
      if (c === '\\') {
        const n = this.s[this.i++]
        if (n !== '"' && n !== '\\') this.fail('invalid escape')
        out += n
      } else if (c === '"') return out
      else {
        const code = c.charCodeAt(0)
        if (code < 0x20 || code > 0x7e) this.fail('invalid string char')
        out += c
      }
    }
    return this.fail('unterminated string')
  }

  token(): SfToken {
    let out = ''
    while (/[A-Za-z0-9!#$%&'*+\-.^_`|~:/]/.test(this.peek()) && !this.done) out += this.s[this.i++]
    return new SfToken(out)
  }

  bytes(): Uint8Array {
    this.i++
    const end = this.s.indexOf(':', this.i)
    if (end < 0) this.fail('unterminated byte sequence')
    const b64 = this.s.slice(this.i, end)
    if (!/^[A-Za-z0-9+/=]*$/.test(b64)) this.fail('invalid base64')
    this.i = end + 1
    return base64ToBytes(b64)
  }

  boolean(): boolean {
    this.i++
    const c = this.s[this.i++]
    if (c === '1') return true
    if (c === '0') return false
    return this.fail('invalid boolean')
  }

  item(): Item {
    const value = this.bareItem()
    return { value, params: this.params() }
  }

  innerList(): InnerList {
    this.i++ // (
    const items: Item[] = []
    while (!this.done) {
      this.sp()
      if (this.peek() === ')') {
        this.i++
        return { items, params: this.params() }
      }
      items.push(this.item())
      const c = this.peek()
      if (c !== ' ' && c !== ')') this.fail('invalid inner list')
    }
    return this.fail('unterminated inner list')
  }

  member(): Member {
    return this.peek() === '(' ? this.innerList() : this.item()
  }

  dictionary(): Dictionary {
    const out: Dictionary = new Map()
    this.sp()
    while (!this.done) {
      const k = this.key()
      let m: Member
      if (this.peek() === '=') {
        this.i++
        m = this.member()
      } else {
        m = { value: true, params: this.params() }
      }
      out.set(k, m)
      this.ows()
      if (this.done) return out
      if (this.peek() !== ',') this.fail('expected comma')
      this.i++
      this.ows()
      if (this.done) this.fail('trailing comma')
    }
    return out
  }
}

function parseTop<T>(input: string, fn: (p: Parser) => T): T {
  const p = new Parser(input.trim())
  const out = fn(p)
  p.sp()
  if (!p.done) p.fail('trailing characters')
  return out
}

export const parseDictionary = (input: string) => parseTop(input, (p) => p.dictionary())
export const parseItem = (input: string) => parseTop(input, (p) => p.item())

// ---- serialization ------------------------------------------------------

export function serializeBareItem(v: BareItem): string {
  if (typeof v === 'boolean') return v ? '?1' : '?0'
  if (typeof v === 'number') {
    if (!Number.isInteger(v)) throw new SfParseError('non-integer number; use SfDecimal')
    return String(v)
  }
  if (v instanceof SfDecimal) {
    const s = (Math.round(v.value * 1000) / 1000).toString()
    return s.includes('.') ? s : `${s}.0`
  }
  if (v instanceof SfToken) return v.value
  if (v instanceof Uint8Array) return `:${bytesToBase64(v)}:`
  return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

export const serializeParams = (params: Params) =>
  params.map(([k, v]) => (v === true ? `;${k}` : `;${k}=${serializeBareItem(v)}`)).join('')

export const serializeItem = (item: Item) => serializeBareItem(item.value) + serializeParams(item.params)

export const serializeInnerList = (list: InnerList) =>
  `(${list.items.map(serializeItem).join(' ')})${serializeParams(list.params)}`

export const serializeMember = (m: Member) => (isInnerList(m) ? serializeInnerList(m) : serializeItem(m))

export const serializeDictionary = (d: Dictionary) =>
  [...d.entries()]
    .map(([k, m]) =>
      !isInnerList(m) && m.value === true ? `${k}${serializeParams(m.params)}` : `${k}=${serializeMember(m)}`
    )
    .join(', ')

export const getParam = (params: Params, key: string): BareItem | undefined =>
  params.find(([k]) => k === key)?.[1]

// ---- base64 helpers (runtime-neutral: browser, edge, node) --------------

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

export const bytesToBase64Url = (bytes: Uint8Array) =>
  bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
