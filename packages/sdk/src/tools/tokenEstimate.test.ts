import { describe, expect, it } from 'vitest'
import { estimateBudget, estimateToolTokens } from './tokenEstimate.js'
import type { GovernedTool } from './registry.js'

describe('estimateToolTokens', () => {
  it('returns characters and a 4-char-per-token estimate', () => {
    const tool: GovernedTool = {
      name: 'cart.add',
      description: 'Add an item to the cart.',
      execute: () => null,
    }
    const estimate = estimateToolTokens(tool)
    expect(estimate.name).toBe('cart.add')
    expect(estimate.characters).toBeGreaterThan(0)
    expect(estimate.tokens).toBe(Math.ceil(estimate.characters / 4))
  })
})

describe('estimateBudget', () => {
  it('aggregates per-tool token costs', () => {
    const tools: GovernedTool[] = [
      { name: 'a', execute: () => null },
      { name: 'b', description: 'detail', execute: () => null },
    ]
    const report = estimateBudget(tools)
    expect(report.perTool).toHaveLength(2)
    expect(report.total).toBe(report.perTool.reduce((sum, item) => sum + item.tokens, 0))
  })
})
