import { createHash, randomBytes } from 'node:crypto'
import { PUBLISHABLE_KEY_PREFIX, SECRET_KEY_PREFIX } from '@agentronics/protocol'
import type { ApiKeyRecord, ApiKeyScope, ApiKeyRepository } from '../storage/types.js'

const TOKEN_BYTES = 24

export const hashApiKey = (key: string): string =>
  createHash('sha256').update(key).digest('hex')

const randomToken = (): string => randomBytes(TOKEN_BYTES).toString('base64url')

export const generateApiKey = (scope: ApiKeyScope): string => {
  const prefix = scope === 'publishable' ? PUBLISHABLE_KEY_PREFIX : SECRET_KEY_PREFIX
  return `${prefix}${randomToken()}`
}

const keyId = (): string => `key_${randomBytes(8).toString('hex')}`

export interface IssuedApiKey {
  record: ApiKeyRecord
  plaintext: string
}

export const issueApiKey = async (
  repo: ApiKeyRepository,
  input: { orgId: string; scope: ApiKeyScope; label: string }
): Promise<IssuedApiKey> => {
  const plaintext = generateApiKey(input.scope)
  const record: ApiKeyRecord = {
    id: keyId(),
    orgId: input.orgId,
    scope: input.scope,
    hash: hashApiKey(plaintext),
    prefix: plaintext.slice(0, 12),
    label: input.label,
    createdAt: new Date().toISOString(),
    revokedAt: null,
  }
  await repo.insert(record)
  return { record, plaintext }
}

export const issueApiKeyPair = async (
  repo: ApiKeyRepository,
  input: { orgId: string; label: string }
): Promise<{ publishable: IssuedApiKey; secret: IssuedApiKey }> => {
  const publishable = await issueApiKey(repo, { ...input, scope: 'publishable' })
  const secret = await issueApiKey(repo, { ...input, scope: 'secret' })
  return { publishable, secret }
}

export interface ResolvedApiKey {
  record: ApiKeyRecord
  scope: ApiKeyScope
}

export const resolveApiKey = async (
  repo: ApiKeyRepository,
  plaintext: string
): Promise<ResolvedApiKey | null> => {
  const record = await repo.findByHash(hashApiKey(plaintext))
  if (!record) return null
  if (record.revokedAt) return null
  return { record, scope: record.scope }
}
