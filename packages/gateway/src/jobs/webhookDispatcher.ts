import type { Storage, WebhookDelivery } from '../storage/types.js'

export interface DispatcherOptions {
  storage: Storage
  fetcher?: typeof fetch
  /** Max attempts before a delivery is dead-lettered. Default 3. */
  maxAttempts?: number
}

export interface DispatcherResult {
  drained: number
  delivered: number
  retried: number
  deadLettered: number
}

const MAX_ATTEMPTS_DEFAULT = 3

export const dispatchPendingWebhooks = async ({
  storage,
  fetcher = fetch,
  maxAttempts = MAX_ATTEMPTS_DEFAULT,
}: DispatcherOptions): Promise<DispatcherResult> => {
  const pending = await storage.webhooks.pending()
  let delivered = 0
  let retried = 0
  let deadLettered = 0

  for (const delivery of pending) {
    const ok = await attempt(fetcher, delivery)
    if (ok) {
      await storage.webhooks.markDelivered(delivery.id, new Date().toISOString())
      delivered += 1
      continue
    }
    const nextAttempts = delivery.attempts + 1
    const shouldDeadLetter = nextAttempts >= maxAttempts
    await storage.webhooks.markFailed(
      delivery.id,
      `delivery failed (attempt ${nextAttempts})`,
      shouldDeadLetter
    )
    if (shouldDeadLetter) deadLettered += 1
    else retried += 1
  }

  return { drained: pending.length, delivered, retried, deadLettered }
}

const attempt = async (
  fetcher: typeof fetch,
  delivery: WebhookDelivery
): Promise<boolean> => {
  try {
    const response = await fetcher(delivery.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(delivery.payload),
    })
    return response.ok
  } catch {
    return false
  }
}
