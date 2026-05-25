import type { AgentIdentity } from '@agentronics/protocol'
import { SDK_VERSION } from "../version.js"

interface SignalResult {
  hit: boolean
  weight: number
  detail?: string
}

const HEADLESS_UA_PATTERNS = [/HeadlessChrome/i, /Headless/i, /PhantomJS/i, /SlimerJS/i]

const checkWebdriver = (): SignalResult => {
  const value =
    typeof navigator !== 'undefined' && (navigator as Navigator & { webdriver?: boolean }).webdriver
  return { hit: value === true, weight: 0.6, detail: 'navigator.webdriver === true' }
}

const checkChromedriver = (): SignalResult => {
  if (typeof window === 'undefined') return { hit: false, weight: 0.5 }
  const keys = Object.keys(window).filter((k) => k.startsWith('cdc_'))
  return { hit: keys.length > 0, weight: 0.5, detail: `window.${keys[0] ?? 'cdc_*'}` }
}

const checkPlugins = (): SignalResult => {
  if (typeof navigator === 'undefined' || !navigator.plugins) return { hit: false, weight: 0.2 }
  const desktop = /Win|Mac|Linux/.test(navigator.userAgent ?? '')
  const empty = navigator.plugins.length === 0
  return { hit: desktop && empty, weight: 0.2, detail: 'desktop UA with no plugins' }
}

const checkHeadlessUa = (): SignalResult => {
  if (typeof navigator === 'undefined') return { hit: false, weight: 0.7 }
  const ua = navigator.userAgent ?? ''
  const hit = HEADLESS_UA_PATTERNS.some((re) => re.test(ua))
  return hit ? { hit, weight: 0.7, detail: `headless UA: ${ua}` } : { hit, weight: 0.7 }
}

const checkLanguages = (): SignalResult => {
  if (typeof navigator === 'undefined') return { hit: false, weight: 0.15 }
  const langs = navigator.languages
  return {
    hit: !langs || langs.length === 0,
    weight: 0.15,
    detail: 'navigator.languages empty',
  }
}

const checkPermissions = (): SignalResult => {
  if (typeof navigator === 'undefined') return { hit: false, weight: 0.1 }
  const hasChrome = 'chrome' in window
  const ua = navigator.userAgent ?? ''
  const looksChrome = /Chrome\//.test(ua) && !/Edg\//.test(ua)
  return {
    hit: looksChrome && !hasChrome,
    weight: 0.2,
    detail: 'Chrome UA without window.chrome',
  }
}

const SIGNALS = {
  webdriver: checkWebdriver,
  chromedriver: checkChromedriver,
  headlessUa: checkHeadlessUa,
  languages: checkLanguages,
  permissions: checkPermissions,
  plugins: checkPlugins,
} as const

export type DomSignalName = keyof typeof SIGNALS

export interface DetectDomOptions {
  /** Floor below which we report no DOM agent. Defaults to 0.4. */
  threshold?: number
}

export const detectDom = (options: DetectDomOptions = {}): AgentIdentity | null => {
  const { threshold = 0.4 } = options

  const signals: Record<string, unknown> = {}
  let totalWeight = 0
  let hitWeight = 0

  for (const [name, check] of Object.entries(SIGNALS)) {
    const result = check()
    totalWeight += result.weight
    signals[name] = { hit: result.hit, weight: result.weight, detail: result.detail }
    if (result.hit) hitWeight += result.weight
  }

  const confidence = totalWeight === 0 ? 0 : hitWeight / totalWeight
  if (confidence < threshold) return null

  return {
    class: 'dom',
    trust: 'detected',
    confidence,
    vendor: null,
    userAgent: typeof navigator === 'undefined' ? null : navigator.userAgent,
    detectionVersion: SDK_VERSION,
    signals,
  }
}
