import { describe, expect, it } from 'vitest'
import { groupTools, listGroupNames, DEFAULT_GROUP } from './groups.js'
import type { GovernedTool } from './registry.js'

const t = (name: string, group?: string): GovernedTool => ({
  name,
  ...(group !== undefined ? { group } : {}),
  execute: () => null,
})

describe('groupTools', () => {
  it('buckets tools by group and sorts groups alphabetically', () => {
    const summary = groupTools([t('cart.add', 'cart'), t('account.update', 'account'), t('cart.remove', 'cart'), t('foo')])
    expect(summary.map((g) => g.name)).toEqual(['account', 'cart', DEFAULT_GROUP])
    expect(summary.find((g) => g.name === 'cart')?.tools.map((tool) => tool.name)).toEqual([
      'cart.add',
      'cart.remove',
    ])
  })

  it('listGroupNames returns unique sorted group names', () => {
    expect(listGroupNames([t('a', 'b'), t('c', 'a'), t('d', 'b')])).toEqual(['a', 'b'])
  })
})
