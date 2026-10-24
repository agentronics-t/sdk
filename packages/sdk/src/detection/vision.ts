import type { AgentIdentity } from '@agentronics/protocol'
import { SDK_VERSION } from '../version.js'

/**
 * Vision-model ("screenshot") agents — computer-use agents that look at
 * screenshots and drive a real browser with synthetic mouse and keyboard
 * input (ChatGPT agent, Claude computer use, Gemini computer use, …).
 *
 * They run in ordinary browsers, so DOM automation flags often don't fire.
 * What gives them away is how they interact:
 *
 * - **teleport clicks** — a click with no pointer movement leading up to it
 *   (the cursor jumps straight to the coordinates the model picked);
 * - **centre clicks** — clicks landing within a pixel or two of an element's
 *   exact centre, again and again;
 * - **metronome typing** — key intervals with almost no variance, or text
 *   inserted with no key events at all;
 * - **no hover or wheel** — clicks and scroll jumps without any mousemove or
 *   wheel activity in between;
 * - **VM-shaped viewport** — exact sizes agent sandboxes use (1024×768, 1280×800…).
 *
 * Each signal is weak alone. The monitor scores them over a short window and
 * reports a `screenshot` agent only when several agree after enough
 * interactions. It reads event coordinates and timing only — never key values
 * or text.
 */

export interface VisionDetectorOptions {
  /** Score (0–1) at which to report an agent. Default 0.6. */
  threshold?: number
  /** Interactions (clicks + typing bursts) needed before scoring. Default 3. */
  minInteractions?: number
  documentRef?: Document
  /** Called once, when the score first crosses the threshold. */
  onDetect?: (identity: AgentIdentity) => void
  /** @internal Tests only: count synthetic (isTrusted=false) events. */
  acceptUntrustedEvents?: boolean
}

export interface VisionSignals {
  clicks: number
  teleportClicks: number
  centreClicks: number
  keyIntervals: number
  keyIntervalCv: number | null
  insertWithoutKeys: number
  pointerMoves: number
  wheelEvents: number
  vmViewport: boolean
}

const VM_VIEWPORTS = new Set(['1024x768', '1280x800', '1280x720', '1280x1024', '1440x900', '1920x1080'])
// Window sizes humans rarely hit exactly when the page fills a maximised
// browser; agent sandboxes set them precisely. Only counts with other signals.

const coefficientOfVariation = (values: number[]): number | null => {
  if (values.length < 6) return null
  const mean = values.reduce((s, v) => s + v, 0) / values.length
  if (mean <= 0) return null
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length
  return Math.sqrt(variance) / mean
}

/** 0–1 score from the collected signals (exported for tests and the console's explanation). */
export const scoreVisionSignals = (s: VisionSignals): number => {
  let score = 0
  if (s.clicks >= 2) {
    score += 0.35 * (s.teleportClicks / s.clicks)
    score += 0.25 * (s.centreClicks / s.clicks)
    if (s.pointerMoves === 0) score += 0.15
  }
  if (s.keyIntervalCv !== null && s.keyIntervalCv < 0.15) score += 0.2
  if (s.insertWithoutKeys > 0) score += 0.15
  if (s.wheelEvents === 0 && s.clicks >= 3) score += 0.05
  if (s.vmViewport) score += 0.1
  return Math.min(1, score)
}

/**
 * Watch the page for vision-agent interaction patterns. Returns a handle with
 * the live signals and score; `onDetect` fires once when the threshold is met.
 */
export const createVisionDetector = (options: VisionDetectorOptions = {}) => {
  const { threshold = 0.6, minInteractions = 3, onDetect, acceptUntrustedEvents = false } = options
  const trusted = (e: Event) => e.isTrusted || acceptUntrustedEvents
  const doc = options.documentRef ?? (typeof document === 'undefined' ? undefined : document)
  const signals: VisionSignals = {
    clicks: 0,
    teleportClicks: 0,
    centreClicks: 0,
    keyIntervals: 0,
    keyIntervalCv: null,
    insertWithoutKeys: 0,
    pointerMoves: 0,
    wheelEvents: 0,
    vmViewport: false,
  }
  let lastMoveAt = Number.NEGATIVE_INFINITY
  let lastKeyAt = 0
  let lastKeyDownAt = 0
  const intervals: number[] = []
  let typingBursts = 0
  let reported: AgentIdentity | null = null

  const view = doc?.defaultView
  if (view) signals.vmViewport = VM_VIEWPORTS.has(`${view.innerWidth}x${view.innerHeight}`)

  const identity = (score: number): AgentIdentity => ({
    class: 'screenshot',
    trust: 'detected',
    confidence: Number(score.toFixed(2)),
    vendor: null,
    userAgent: typeof navigator === 'undefined' ? null : navigator.userAgent,
    detectionVersion: SDK_VERSION,
    signals: { vision: true, ...signals },
  })

  const evaluate = () => {
    if (reported || signals.clicks + typingBursts < minInteractions) return
    const score = scoreVisionSignals(signals)
    if (score >= threshold) {
      reported = identity(score)
      onDetect?.(reported)
    }
  }

  const onMove = (e: Event) => {
    if (!trusted(e)) return
    signals.pointerMoves += 1
    lastMoveAt = e.timeStamp
  }
  const onWheel = (e: Event) => {
    if (trusted(e)) signals.wheelEvents += 1
  }
  const onClick = (e: Event) => {
    if (!trusted(e)) return // scripted clicks are DOM automation, not vision agents
    const m = e as MouseEvent
    signals.clicks += 1
    if (e.timeStamp - lastMoveAt > 400) signals.teleportClicks += 1
    const target = m.target instanceof Element ? m.target : null
    if (target && typeof target.getBoundingClientRect === 'function') {
      const r = target.getBoundingClientRect()
      if (r.width > 8 && r.height > 8) {
        const dx = Math.abs(m.clientX - (r.left + r.width / 2))
        const dy = Math.abs(m.clientY - (r.top + r.height / 2))
        if (dx <= 1.5 && dy <= 1.5) signals.centreClicks += 1
      }
    }
    evaluate()
  }
  const onKeyDown = (e: Event) => {
    if (!trusted(e)) return
    const t = e.timeStamp
    if (lastKeyAt && t - lastKeyAt < 1500) {
      intervals.push(t - lastKeyAt)
      if (intervals.length > 60) intervals.shift()
      signals.keyIntervals = intervals.length
      signals.keyIntervalCv = coefficientOfVariation(intervals)
    } else {
      typingBursts += 1
    }
    lastKeyAt = t
    lastKeyDownAt = t
  }
  const onInput = (e: Event) => {
    if (!trusted(e)) return
    const ie = e as InputEvent
    // Text inserted with no keydown just before it: CDP Input.insertText / IME-less paste-free typing.
    if (ie.inputType === 'insertText' && ie.data && ie.data.length > 1 && e.timeStamp - lastKeyDownAt > 200) {
      signals.insertWithoutKeys += 1
      typingBursts += 1
      evaluate()
    }
  }
  const onKeyUp = () => evaluate()

  const listeners: Array<[string, (e: Event) => void]> = [
    ['pointermove', onMove],
    ['mousemove', onMove],
    ['wheel', onWheel],
    ['click', onClick],
    ['keydown', onKeyDown],
    ['keyup', onKeyUp],
    ['input', onInput],
  ]
  for (const [type, fn] of listeners) doc?.addEventListener(type, fn, { capture: true, passive: true })

  return {
    signals: (): VisionSignals => ({ ...signals }),
    score: () => scoreVisionSignals(signals),
    detected: () => reported,
    stop: () => {
      for (const [type, fn] of listeners) doc?.removeEventListener(type, fn, { capture: true })
    },
  }
}

export type VisionDetector = ReturnType<typeof createVisionDetector>
