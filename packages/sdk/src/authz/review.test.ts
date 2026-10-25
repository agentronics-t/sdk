import { describe, expect, it, vi } from 'vitest'
import { createToolRegistry } from '../tools/registry.js'
import { createReviewPrompt } from './reviewPrompt.js'

const reviewPolicy = async () => ({ decision: 'review' as const, ruleId: 'tool:pay', reason: 'Payments need approval.' })

describe('review decisions', () => {
  it('runs the tool only after the reviewer approves', async () => {
    const execute = vi.fn(() => ({ paid: true }))
    const reviewer = vi.fn(async () => true)
    const onTrace = vi.fn()
    const registry = createToolRegistry({ evaluate: reviewPolicy, reviewer, onTrace })
    registry.register({ name: 'pay', title: 'Pay invoice', execute })

    await expect(registry.execute('pay', { amount: 20 })).resolves.toEqual({ paid: true })
    expect(reviewer).toHaveBeenCalledWith(expect.objectContaining({ tool: 'pay', title: 'Pay invoice', input: { amount: 20 } }))
    expect(onTrace).toHaveBeenCalledWith(expect.objectContaining({ type: 'authz.evaluated', outcome: 'success', metadata: expect.objectContaining({ review: true, approved: true }) }))
    expect(onTrace).toHaveBeenCalledWith(expect.objectContaining({ type: 'tool.executed', outcome: 'success' }))
  })

  it('refuses the call when the reviewer says no — the tool never runs', async () => {
    const execute = vi.fn()
    const registry = createToolRegistry({ evaluate: reviewPolicy, reviewer: async () => false })
    registry.register({ name: 'pay', execute })
    await expect(registry.execute('pay', {})).rejects.toThrow(/did not approve/)
    expect(execute).not.toHaveBeenCalled()
  })

  it('refuses review calls when no reviewer is configured (never silently runs)', async () => {
    const execute = vi.fn()
    const registry = createToolRegistry({ evaluate: reviewPolicy })
    registry.register({ name: 'pay', execute })
    await expect(registry.execute('pay', {})).rejects.toThrow(/no reviewer/)
    expect(execute).not.toHaveBeenCalled()
  })

  it('passes the agent cancellation signal through to the tool', async () => {
    const seen: Array<AbortSignal | undefined> = []
    const registry = createToolRegistry({ evaluate: async () => ({ decision: 'allow', ruleId: null, reason: 'ok' }) })
    registry.register({ name: 'slow', execute: (_input, ctx) => void seen.push(ctx.signal) })
    const controller = new AbortController()
    await registry.execute('slow', {}, null, { signal: controller.signal })
    expect(seen[0]).toBe(controller.signal)
  })
})

describe('review prompt', () => {
  it('shows a dialog and resolves true on Allow', async () => {
    const prompt = createReviewPrompt()
    const pending = prompt({ tool: 'pay', title: 'pay the invoice', input: { amount: 20 }, identity: null, reason: '' })
    const dialog = document.querySelector('[data-agentronics-review] [role="dialog"]')!
    expect(dialog.textContent).toContain('An AI agent wants to pay the invoice')
    expect(dialog.textContent).toContain('amount: 20')
    ;[...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Allow')!.click()
    await expect(pending).resolves.toBe(true)
    expect(document.querySelector('[data-agentronics-review]')).toBeNull()
  })

  it('resolves false on Escape and on timeout', async () => {
    const prompt = createReviewPrompt({ timeoutMs: 30 })
    const escaped = prompt({ tool: 'pay', input: {}, identity: null, reason: '' })
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await expect(escaped).resolves.toBe(false)
    await expect(prompt({ tool: 'pay', input: {}, identity: null, reason: '' })).resolves.toBe(false)
  })
})
