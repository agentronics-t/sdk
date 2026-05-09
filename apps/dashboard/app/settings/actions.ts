'use server'

import { revalidatePath } from 'next/cache'
import { gatewayFetch } from '../../lib/gateway'

export const scheduleWebhookAction = async (formData: FormData): Promise<void> => {
  const url = String(formData.get('url') ?? '').trim()
  if (!url) throw new Error('Webhook URL is required.')
  const response = await gatewayFetch('/v1/webhooks/test', {
    method: 'POST',
    body: JSON.stringify({ url, payload: { ping: true, scheduledFromDashboard: true } }),
  })
  if (!response.ok) {
    throw new Error(`gateway ${response.status} on POST /v1/webhooks/test`)
  }
  revalidatePath('/settings')
}
