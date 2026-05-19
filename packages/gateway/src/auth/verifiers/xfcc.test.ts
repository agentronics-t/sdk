import { describe, expect, it } from 'vitest'
import { parseXfcc, selectXfccEntry } from './xfcc.js'

describe('xfcc parser', () => {
  it('parses a single entry with subject + uri', () => {
    const header = 'By=spiffe://edge.acme/proxy;Hash=abc;Subject="CN=agent-42,O=Acme";URI=spiffe://prod.acme/agents/42'
    const entries = parseXfcc(header)
    expect(entries).toHaveLength(1)
    expect(entries[0]?.by).toBe('spiffe://edge.acme/proxy')
    expect(entries[0]?.hash).toBe('abc')
    expect(entries[0]?.subject).toBe('CN=agent-42,O=Acme')
    expect(entries[0]?.uri).toEqual(['spiffe://prod.acme/agents/42'])
  })

  it('parses multiple comma-separated entries', () => {
    const header = 'By=edge1;Hash=a,By=edge2;Hash=b'
    const entries = parseXfcc(header)
    expect(entries).toHaveLength(2)
    expect(entries[0]?.by).toBe('edge1')
    expect(entries[1]?.by).toBe('edge2')
  })

  it('keeps quoted commas/semicolons inside subject values intact', () => {
    const header = 'Subject="CN=agent,O=Acme;OU=Eng"'
    const entries = parseXfcc(header)
    expect(entries).toHaveLength(1)
    expect(entries[0]?.subject).toBe('CN=agent,O=Acme;OU=Eng')
  })

  it('URL-decodes Cert PEM payloads', () => {
    const pem = '-----BEGIN CERTIFICATE-----\nABC\n-----END CERTIFICATE-----'
    const header = `Cert=${encodeURIComponent(pem)};Hash=h`
    const entries = parseXfcc(header)
    expect(entries[0]?.cert).toBe(pem)
  })

  it('accumulates multiple URI/DNS fields per entry', () => {
    const header = 'URI=spiffe://td/a;URI=spiffe://td/b;DNS=svc.local;DNS=svc.cluster'
    const entries = parseXfcc(header)
    expect(entries[0]?.uri).toEqual(['spiffe://td/a', 'spiffe://td/b'])
    expect(entries[0]?.dns).toEqual(['svc.local', 'svc.cluster'])
  })

  it('selectXfccEntry honors policy', () => {
    const entries = parseXfcc('By=a,By=b,By=c')
    expect(selectXfccEntry(entries, 'first').by).toBe('a')
    expect(selectXfccEntry(entries, 'last').by).toBe('c')
    expect(() => selectXfccEntry(entries, 'only')).toThrow(/only_policy/)
    expect(selectXfccEntry(parseXfcc('By=solo'), 'only').by).toBe('solo')
  })
})
