import { describe, expect, it } from 'vitest'
import { createRateLimiter, type RateLimiterStorage } from './rateLimiter.js'

const memory = (): RateLimiterStorage => {
  const values = new Map<string, string>()
  return {
    read: (key) => values.get(key) ?? null,
    write: (key, value) => {
      values.set(key, value)
    },
  }
}

describe('rate limiter', () => {
  it('allows requests until the bucket is exhausted', () => {
    const limiter = createRateLimiter(memory())
    const first = limiter.consume('agent:tool', { max: 2, windowSeconds: 60 }, 1000)
    const second = limiter.consume('agent:tool', { max: 2, windowSeconds: 60 }, 1001)
    const third = limiter.consume('agent:tool', { max: 2, windowSeconds: 60 }, 1002)
    expect(first.allowed).toBe(true)
    expect(second.allowed).toBe(true)
    expect(third.allowed).toBe(false)
  })

  it('resets after the window expires', () => {
    const limiter = createRateLimiter(memory())
    limiter.consume('agent:tool', { max: 1, windowSeconds: 1 }, 1000)
    const next = limiter.consume('agent:tool', { max: 1, windowSeconds: 1 }, 3000)
    expect(next.allowed).toBe(true)
  })
})
