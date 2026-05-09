export interface RateLimitRule {
  max: number
  windowSeconds: number
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
}

interface Bucket {
  count: number
  resetAt: number
}

export interface RateLimiterStorage {
  read(key: string): string | null
  write(key: string, value: string): void
}

const memoryStorage = (): RateLimiterStorage => {
  const map = new Map<string, string>()
  return {
    read: (key) => map.get(key) ?? null,
    write: (key, value) => {
      map.set(key, value)
    },
  }
}

const browserStorage = (): RateLimiterStorage => {
  if (typeof window === 'undefined' || !window.localStorage) return memoryStorage()
  return {
    read: (key) => {
      try {
        return window.localStorage.getItem(key)
      } catch {
        return null
      }
    },
    write: (key, value) => {
      try {
        window.localStorage.setItem(key, value)
      } catch {
        // Quota/storage failures should not crash policy evaluation.
      }
    },
  }
}

const decode = (raw: string | null): Bucket | null => {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Bucket
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      Number.isFinite(parsed.count) &&
      Number.isFinite(parsed.resetAt)
    ) {
      return parsed
    }
  } catch {
    return null
  }
  return null
}

export const createRateLimiter = (storage: RateLimiterStorage = browserStorage()) => ({
  consume(key: string, rule: RateLimitRule, now = Date.now()): RateLimitResult {
    const storageKey = `agtx:rate:${key}`
    const existing = decode(storage.read(storageKey))
    const resetAt =
      existing && existing.resetAt > now ? existing.resetAt : now + rule.windowSeconds * 1000
    const count = existing && existing.resetAt > now ? existing.count + 1 : 1
    storage.write(storageKey, JSON.stringify({ count, resetAt }))

    return {
      allowed: count <= rule.max,
      remaining: Math.max(0, rule.max - count),
      resetAt,
    }
  },
})

export type RateLimiter = ReturnType<typeof createRateLimiter>
