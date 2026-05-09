import { z } from 'zod'

export const PUBLISHABLE_KEY_PREFIX = 'agtx_pk_'
export const SECRET_KEY_PREFIX = 'agtx_sk_'

export type ApiKeyKind = 'publishable' | 'secret'

export const PublishableApiKey = z
  .string()
  .min(PUBLISHABLE_KEY_PREFIX.length + 8)
  .startsWith(PUBLISHABLE_KEY_PREFIX, {
    message: `Publishable keys must start with "${PUBLISHABLE_KEY_PREFIX}".`,
  })

export const SecretApiKey = z
  .string()
  .min(SECRET_KEY_PREFIX.length + 8)
  .startsWith(SECRET_KEY_PREFIX, {
    message: `Secret keys must start with "${SECRET_KEY_PREFIX}".`,
  })

export const classifyApiKey = (key: string): ApiKeyKind | 'unknown' => {
  if (key.startsWith(PUBLISHABLE_KEY_PREFIX)) return 'publishable'
  if (key.startsWith(SECRET_KEY_PREFIX)) return 'secret'
  return 'unknown'
}
