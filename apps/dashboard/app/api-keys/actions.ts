'use server'

import { revalidatePath } from 'next/cache'
import { gatewayFetch } from '../../lib/gateway'

export interface IssuedKeys {
  publishable: { id: string; key: string }
  secret: { id: string; key: string }
}

export const issueKeyAction = async (formData: FormData): Promise<IssuedKeys> => {
  const label = String(formData.get('label') ?? '').trim()
  if (!label) throw new Error('Label is required.')
  const response = await gatewayFetch('/v1/api-keys', {
    method: 'POST',
    body: JSON.stringify({ label }),
  })
  if (!response.ok) {
    throw new Error(`gateway ${response.status} on POST /v1/api-keys`)
  }
  const body = (await response.json()) as IssuedKeys
  revalidatePath('/api-keys')
  return body
}

export const revokeKeyAction = async (formData: FormData): Promise<void> => {
  const id = String(formData.get('id') ?? '')
  if (!id) throw new Error('Missing key id.')
  const response = await gatewayFetch(`/v1/api-keys/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  if (!response.ok && response.status !== 404) {
    throw new Error(`gateway ${response.status} on DELETE /v1/api-keys/${id}`)
  }
  revalidatePath('/api-keys')
}
