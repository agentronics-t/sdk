'use server'

import { revalidatePath } from 'next/cache'
import { gatewayFetch } from '../../../lib/gateway'

type Protocol = 'sso' | 'spiffe' | 'mtls'

const splitCsv = (raw: string): string[] =>
  raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

const splitPemBlocks = (raw: string): string[] => {
  // Customers paste one-or-more PEMs separated by blank lines (Envoy/openssl
  // convention). We don't try to parse the PEM here — the gateway verifier
  // does that and returns 400 if anything is malformed.
  const blocks: string[] = []
  let current: string[] = []
  for (const line of raw.split(/\r?\n/)) {
    if (line.trim() === '' && current.length > 0) {
      blocks.push(current.join('\n').trim())
      current = []
    } else if (line.trim() !== '') {
      current.push(line)
    }
  }
  if (current.length > 0) blocks.push(current.join('\n').trim())
  return blocks
}

const putConfig = async (siteId: string, protocol: Protocol, body: unknown) => {
  const res = await gatewayFetch(
    `/v1/sites/${encodeURIComponent(siteId)}/protocol-config/${protocol}`,
    { method: 'PUT', body: JSON.stringify(body) }
  )
  if (!res.ok) {
    const detail = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(
      `Could not save ${protocol} config (${res.status}${detail.error ? `: ${detail.error}` : ''})`
    )
  }
  revalidatePath(`/sites/${siteId}`)
}

export const upsertSsoConfigAction = async (formData: FormData): Promise<void> => {
  const siteId = String(formData.get('siteId') ?? '')
  if (!siteId) throw new Error('Missing siteId.')
  const issuer = String(formData.get('issuer') ?? '').trim()
  const audiences = splitCsv(String(formData.get('audiences') ?? ''))
  if (!issuer) throw new Error('Issuer URL is required.')
  if (audiences.length === 0) throw new Error('At least one audience is required.')
  await putConfig(siteId, 'sso', { issuer, audiences })
}

export const upsertSpiffeConfigAction = async (formData: FormData): Promise<void> => {
  const siteId = String(formData.get('siteId') ?? '')
  if (!siteId) throw new Error('Missing siteId.')
  const trustDomain = String(formData.get('trustDomain') ?? '').trim()
  const bundleEndpoint = String(formData.get('bundleEndpoint') ?? '').trim()
  const audiences = splitCsv(String(formData.get('audiences') ?? ''))
  const googleTrustDomains = splitCsv(String(formData.get('googleTrustDomains') ?? ''))
  if (!trustDomain) throw new Error('Trust domain is required.')
  if (!bundleEndpoint) throw new Error('Bundle endpoint URL is required.')
  if (audiences.length === 0) throw new Error('At least one audience is required.')
  const body: Record<string, unknown> = { trustDomain, bundleEndpoint, audiences }
  if (googleTrustDomains.length > 0) body.googleTrustDomains = googleTrustDomains
  await putConfig(siteId, 'spiffe', body)
}

export const upsertMtlsConfigAction = async (formData: FormData): Promise<void> => {
  const siteId = String(formData.get('siteId') ?? '')
  if (!siteId) throw new Error('Missing siteId.')
  const rootCerts = splitPemBlocks(String(formData.get('rootCerts') ?? ''))
  const spiffeTrustDomain = String(formData.get('spiffeTrustDomain') ?? '').trim()
  const xfccEntryPolicy = String(formData.get('xfccEntryPolicy') ?? 'last') as
    | 'last'
    | 'first'
    | 'only'
  if (rootCerts.length === 0) throw new Error('At least one root cert (PEM) is required.')
  const body: Record<string, unknown> = { rootCerts, xfccEntryPolicy }
  if (spiffeTrustDomain) body.spiffeTrustDomain = spiffeTrustDomain
  await putConfig(siteId, 'mtls', body)
}

export const deleteProtocolConfigAction = async (formData: FormData): Promise<void> => {
  const siteId = String(formData.get('siteId') ?? '')
  const protocol = String(formData.get('protocol') ?? '') as Protocol
  if (!siteId || !protocol) throw new Error('Missing siteId or protocol.')
  const res = await gatewayFetch(
    `/v1/sites/${encodeURIComponent(siteId)}/protocol-config/${protocol}`,
    { method: 'DELETE' }
  )
  if (!res.ok && res.status !== 404) {
    throw new Error(`Could not delete ${protocol} config (${res.status})`)
  }
  revalidatePath(`/sites/${siteId}`)
}
