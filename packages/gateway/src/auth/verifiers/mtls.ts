import { X509Certificate } from 'node:crypto'
import type { VerificationResult } from '@agentronics/protocol'
import type { MtlsConfig } from '../../storage/types.js'
import { parseXfcc, selectXfccEntry } from './xfcc.js'

const extractSpiffeId = (uris: string[]): string | undefined =>
  uris.find((u) => u.startsWith('spiffe://'))

// We rely on the edge to have terminated mTLS and validated the chain
// end-to-end (XFCC is only forwarded on success). The defense-in-depth
// check here is: (a) the leaf cert was issued by one of the customer's
// registered roots, and (b) the signature verifies against that root's
// public key. This catches the "wrong customer's cert was forwarded"
// failure mode without re-doing full path validation.
export const verifyMtls = async (
  xfccHeader: string,
  config: MtlsConfig
): Promise<VerificationResult> => {
  const entries = parseXfcc(xfccHeader)
  const entry = selectXfccEntry(entries, config.xfccEntryPolicy)
  if (!entry.cert) throw new Error('xfcc_entry_missing_cert')

  const leaf = new X509Certificate(entry.cert)
  const roots = config.rootCerts.map((pem) => new X509Certificate(pem))
  const issuer = roots.find((root) => leaf.checkIssued(root))
  if (!issuer) throw new Error('mtls_no_matching_root')
  if (!leaf.verify(issuer.publicKey)) throw new Error('mtls_signature_invalid')

  const spiffeId = extractSpiffeId(entry.uri)
  if (spiffeId && config.spiffeTrustDomain) {
    let trustDomain: string
    try {
      trustDomain = new URL(spiffeId).host
    } catch {
      throw new Error('mtls_spiffe_uri_malformed')
    }
    if (trustDomain !== config.spiffeTrustDomain) {
      throw new Error('mtls_spiffe_trust_domain_mismatch')
    }
  }

  const fingerprint = entry.hash ?? leaf.fingerprint256
  const subject = entry.subject ?? leaf.subject
  const signals: Record<string, unknown> = {
    fingerprint,
    subject,
    issuer: issuer.subject,
  }
  if (spiffeId) signals.spiffeId = spiffeId
  if (entry.uri.length) signals.uri = entry.uri
  if (entry.dns.length) signals.dns = entry.dns

  return {
    trust: 'verified',
    vendor: issuer.subject ?? 'mtls',
    validUntil: new Date(leaf.validTo).toISOString(),
    subject: spiffeId ?? subject,
    protocol: 'mtls',
    signals,
  }
}
