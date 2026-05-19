'use server'

import { revalidatePath } from 'next/cache'
import { gatewayFetch } from '../../lib/gateway'

export const createSiteAction = async (formData: FormData): Promise<void> => {
  const siteId = String(formData.get('siteId') ?? '').trim()
  const name = String(formData.get('name') ?? '').trim()
  if (!siteId) throw new Error('Site ID is required.')
  if (!name) throw new Error('Display name is required.')
  const res = await gatewayFetch('/v1/sites', {
    method: 'POST',
    body: JSON.stringify({ siteId, name }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(`Could not create site (${res.status}${body.error ? `: ${body.error}` : ''})`)
  }
  revalidatePath('/sites')
}

export const deleteSiteAction = async (formData: FormData): Promise<void> => {
  const id = String(formData.get('id') ?? '')
  if (!id) throw new Error('Missing site id.')
  const res = await gatewayFetch(`/v1/sites/${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!res.ok && res.status !== 404) {
    throw new Error(`Could not delete site (${res.status})`)
  }
  revalidatePath('/sites')
}
