import { afterEach, describe, expect, it } from 'vitest'
import { detectCrawler, CRAWLER_SIGNATURES } from './crawler.js'

const setUa = (value: string) => {
  Object.defineProperty(navigator, 'userAgent', { value, configurable: true, writable: true })
}
const restoreUa = () => {
  delete (navigator as unknown as Record<string, unknown>)['userAgent']
}

describe('detectCrawler', () => {
  afterEach(() => restoreUa())

  it('returns null for a normal browser UA', () => {
    setUa(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0 Safari/537.36'
    )
    expect(detectCrawler()).toBeNull()
  })

  it('identifies GPTBot as an AI crawler (spoofable, so confidence 0.9)', () => {
    setUa('Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot')
    const id = detectCrawler()
    expect(id?.class).toBe('crawler')
    expect(id?.vendor).toBe('GPTBot')
    expect(id?.trust).toBe('detected')
    expect(id?.confidence).toBe(0.9)
    expect(id?.signals).toMatchObject({ matched: 'GPTBot', category: 'ai' })
  })

  it('identifies ClaudeBot', () => {
    setUa('Mozilla/5.0 (compatible; ClaudeBot/1.0; +https://anthropic.com/claudebot)')
    expect(detectCrawler()?.vendor).toBe('ClaudeBot')
  })

  it('identifies Googlebot as a search crawler', () => {
    setUa('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)')
    const id = detectCrawler()
    expect(id?.vendor).toBe('Googlebot')
    expect(id?.signals).toMatchObject({ category: 'search' })
  })

  it('prefers the more specific Applebot-Extended over the broader Applebot token', () => {
    setUa('Mozilla/5.0 (compatible; Applebot-Extended/0.1; +http://www.apple.com/go/applebot)')
    const id = detectCrawler()
    expect(id?.vendor).toBe('Applebot-Extended')
    expect(id?.signals).toMatchObject({ category: 'ai' })
  })

  it('short-circuits when disabled', () => {
    setUa('Mozilla/5.0 (compatible; GPTBot/1.2)')
    expect(detectCrawler({ disable: true })).toBeNull()
  })

  it('accepts custom signatures for first-party crawlers', () => {
    setUa('Mozilla/5.0 AcmeInternalCrawler/3')
    const id = detectCrawler({
      signatures: [{ name: 'AcmeBot', category: 'ai', pattern: /AcmeInternalCrawler/i }],
    })
    expect(id?.vendor).toBe('AcmeBot')
  })

  it('ships a non-trivial signature table', () => {
    expect(CRAWLER_SIGNATURES.length).toBeGreaterThan(10)
  })
})
