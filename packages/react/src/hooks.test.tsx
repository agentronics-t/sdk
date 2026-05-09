import { describe, expect, it } from 'vitest'
import { act, render, renderHook } from '@testing-library/react'
import { type ReactNode } from 'react'
import { AgentronicsProvider, useAgentronics } from './AgentronicsProvider.js'
import { useGovernedTool } from './useGovernedTool.js'
import { useAgentContext } from './useAgentContext.js'
import { useSiteMemory } from './useSiteMemory.js'

const PUBLISHABLE_KEY = 'agtx_pk_test_1234567890'

const wrapper = ({ children }: { children: ReactNode }) => (
  <AgentronicsProvider publishableKey={PUBLISHABLE_KEY}>{children}</AgentronicsProvider>
)

describe('useAgentronics', () => {
  it('throws outside the provider', () => {
    expect(() => renderHook(() => useAgentronics())).toThrow(/AgentronicsProvider/)
  })

  it('returns the SDK client inside the provider', () => {
    const { result } = renderHook(() => useAgentronics(), { wrapper })
    expect(result.current.publishableKey).toBe(PUBLISHABLE_KEY)
  })
})

describe('useGovernedTool', () => {
  it('registers on mount and unregisters on unmount', () => {
    const { result, unmount } = renderHook(
      () => {
        const client = useAgentronics()
        useGovernedTool({ name: 'cart.add', execute: () => ({ ok: true }) })
        return client
      },
      { wrapper }
    )
    expect(result.current.tools.list().some((tool) => tool.name === 'cart.add')).toBe(true)
    const clientRef = result.current
    unmount()
    expect(clientRef.tools.list().some((tool) => tool.name === 'cart.add')).toBe(false)
  })
})

describe('useAgentContext', () => {
  it('reflects identity changes when present/clear is called', () => {
    const { result } = renderHook(
      () => {
        const client = useAgentronics()
        const ctx = useAgentContext()
        return { client, ctx }
      },
      { wrapper }
    )
    expect(result.current.ctx.identity).toBeNull()
    expect(result.current.ctx.source).toBe('initial')

    act(() => {
      result.current.client.presentIdentity({
        class: 'screenshot',
        vendor: 'demo',
        token: 'tok_demo_test_only',
      })
    })
    expect(result.current.ctx.identity?.class).toBe('screenshot')
    expect(result.current.ctx.source).toBe('declare')

    act(() => {
      result.current.client.clearIdentity()
    })
    expect(result.current.ctx.identity).toBeNull()
    expect(result.current.ctx.source).toBe('cleared')
  })
})

describe('useSiteMemory', () => {
  it('returns the live snapshot and re-renders on provide()', () => {
    const { result } = renderHook(
      () => {
        const client = useAgentronics()
        const memory = useSiteMemory()
        return { client, memory }
      },
      { wrapper }
    )
    expect(result.current.memory.workflows).toEqual({})
    act(() => {
      result.current.client.provideSiteMemory({
        workflows: { purchase: { steps: [{ step: 1, action: 'add' }] } },
      })
    })
    expect(result.current.memory.workflows.purchase?.steps[0]?.action).toBe('add')
  })

  it('reads a dot-path slice', () => {
    const { result } = renderHook(
      () => {
        const client = useAgentronics()
        const policy = useSiteMemory<string>('policies.shipping')
        return { client, policy }
      },
      { wrapper }
    )
    expect(result.current.policy).toBeUndefined()
    act(() => {
      result.current.client.provideSiteMemory({ policies: { shipping: 'Free over $50' } })
    })
    expect(result.current.policy).toBe('Free over $50')
  })
})

describe('AgentronicsProvider', () => {
  it('renders children', () => {
    const { container } = render(
      <AgentronicsProvider publishableKey={PUBLISHABLE_KEY}>
        <span data-testid="child">hello</span>
      </AgentronicsProvider>
    )
    expect(container.querySelector('[data-testid="child"]')?.textContent).toBe('hello')
  })
})
