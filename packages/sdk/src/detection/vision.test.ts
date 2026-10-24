import { afterEach, describe, expect, it, vi } from 'vitest'
import { createVisionDetector, scoreVisionSignals, type VisionDetector } from './vision.js'

const button = (x = 100, y = 100, w = 120, h = 40) => {
  const el = document.createElement('button')
  el.getBoundingClientRect = () => ({ left: x, top: y, width: w, height: h, right: x + w, bottom: y + h, x, y, toJSON: () => ({}) }) as DOMRect
  document.body.appendChild(el)
  return el
}
const click = (el: Element, clientX: number, clientY: number) =>
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX, clientY }))

let detector: VisionDetector | null = null
afterEach(() => {
  detector?.stop()
  document.body.innerHTML = ''
})

describe('vision-agent detector', () => {
  it('reports a screenshot agent for repeated teleport + dead-centre clicks', () => {
    const onDetect = vi.fn()
    detector = createVisionDetector({ onDetect, acceptUntrustedEvents: true })
    const el = button()
    for (let i = 0; i < 3; i++) click(el, 160, 120) // exact centre, no mousemove
    expect(onDetect).toHaveBeenCalledOnce()
    const identity = onDetect.mock.calls[0]![0]
    expect(identity).toMatchObject({ class: 'screenshot', trust: 'detected' })
    expect(identity.signals).toMatchObject({ vision: true, teleportClicks: 3, centreClicks: 3, pointerMoves: 0 })
  })

  it('stays quiet for human-looking clicks (mouse travels, lands off-centre)', () => {
    const onDetect = vi.fn()
    detector = createVisionDetector({ onDetect, acceptUntrustedEvents: true })
    const el = button()
    for (const [x, y] of [[131, 109], [187, 126], [149, 131], [172, 112]]) {
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: x! - 20, clientY: y! - 5 }))
      click(el, x!, y!)
    }
    expect(onDetect).not.toHaveBeenCalled()
    expect(detector.score()).toBeLessThan(0.6)
  })

  it('ignores synthetic events by default (scripted clicks are DOM automation)', () => {
    const onDetect = vi.fn()
    detector = createVisionDetector({ onDetect })
    const el = button()
    for (let i = 0; i < 4; i++) click(el, 160, 120)
    expect(detector.signals().clicks).toBe(0)
    expect(onDetect).not.toHaveBeenCalled()
  })

  it('scores metronome typing and text inserted without key events', () => {
    const base = { clicks: 0, teleportClicks: 0, centreClicks: 0, keyIntervals: 10, pointerMoves: 0, wheelEvents: 0, vmViewport: false }
    expect(scoreVisionSignals({ ...base, keyIntervalCv: 0.05, insertWithoutKeys: 2 })).toBeCloseTo(0.35)
    expect(scoreVisionSignals({ ...base, keyIntervalCv: 0.6, insertWithoutKeys: 0 })).toBe(0)
  })
})
