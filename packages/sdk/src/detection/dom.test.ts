import { afterEach, describe, expect, it } from 'vitest'
import { detectDom } from './dom.js'

const setNavigatorProp = (key: string, value: unknown) => {
  Object.defineProperty(navigator, key, { value, configurable: true, writable: true })
}

const restoreNavigatorProp = (key: string) => {
  delete (navigator as unknown as Record<string, unknown>)[key]
}

describe('detectDom', () => {
  afterEach(() => {
    restoreNavigatorProp('webdriver')
    restoreNavigatorProp('userAgent')
  })

  it('returns null on a clean navigator', () => {
    const result = detectDom()
    expect(result).toBeNull()
  })

  it('flags a Playwright-like environment', () => {
    setNavigatorProp('webdriver', true)
    setNavigatorProp(
      'userAgent',
      'Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/127.0.0.0 Safari/537.36'
    )
    const result = detectDom()
    expect(result).not.toBeNull()
    expect(result?.class).toBe('dom')
    expect(result?.confidence).toBeGreaterThan(0.4)
    expect(result?.signals).toHaveProperty('webdriver')
    expect(result?.signals).toHaveProperty('headlessUa')
  })

  it('respects a higher threshold', () => {
    setNavigatorProp('webdriver', true)
    const result = detectDom({ threshold: 0.95 })
    expect(result).toBeNull()
  })
})
