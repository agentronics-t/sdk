import { useState, type CSSProperties } from 'react'
import {
  useAgentContext,
  useAgentronics,
  useGovernedTool,
  useSiteMemory,
} from '@agentronics/react'

const panelStyle = {
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '1rem',
  background: 'var(--bg-elevated)',
  color: 'var(--text)',
} satisfies CSSProperties

const preStyle = {
  background: 'var(--bg-muted)',
  border: '1px solid var(--border)',
  padding: '0.75rem',
  borderRadius: 8,
  overflowX: 'auto',
  fontSize: 12,
  color: 'var(--text)',
  fontFamily: "'Space Mono', ui-monospace, monospace",
} satisfies CSSProperties

export const ReactExample = () => {
  const client = useAgentronics()
  const context = useAgentContext()
  const memorySnapshot = useSiteMemory()
  const shippingPolicy = useSiteMemory<string>('policies.shipping')
  const [lastInvocation, setLastInvocation] = useState<string | null>(null)

  useGovernedTool({
    name: 'react.example.touch',
    description: 'Demonstrates useGovernedTool — auto-unregisters on unmount.',
    inputSchema: { type: 'object', properties: { reason: { type: 'string' } } },
    authz: { minTrust: 'detected', allowedClasses: [], decision: 'allow' },
    execute: (input) => {
      const reason = (input as { reason?: string } | undefined)?.reason ?? 'manual'
      setLastInvocation(`${reason} @ ${new Date().toISOString()}`)
      return { ok: true }
    },
  })

  const handleManualInvoke = () => {
    client.notifyToolInvoked('react.example.touch')
    setLastInvocation(`button @ ${new Date().toISOString()}`)
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: 16,
        marginTop: '1rem',
      }}
    >
      <section style={panelStyle}>
        <h2>useAgentContext</h2>
        <p style={{ marginTop: 0, color: 'var(--text-muted)' }}>
          Live agent identity from the SDK store. Reactive — re-renders on declare /
          authenticate / clear.
        </p>
        <pre style={preStyle}>{JSON.stringify(context, null, 2)}</pre>
      </section>

      <section style={panelStyle}>
        <h2>useGovernedTool</h2>
        <p style={{ marginTop: 0, color: 'var(--text-muted)' }}>
          Registers <code>react.example.touch</code> for the lifetime of this component.
          Unmount the tab to confirm it auto-unregisters.
        </p>
        <p>
          <button onClick={handleManualInvoke}>Invoke react.example.touch</button>
        </p>
        <p style={{ margin: '8px 0', color: 'var(--text-muted)' }}>
          Last invocation: <code>{lastInvocation ?? 'never'}</code>
        </p>
      </section>

      <section style={panelStyle}>
        <h2>useSiteMemory</h2>
        <p style={{ marginTop: 0, color: 'var(--text-muted)' }}>
          Reactive view over the site memory store. The path-scoped overload pulls a
          typed slice — try editing the policies in the Governance tab and watch this
          field update.
        </p>
        <p>
          <strong>policies.shipping:</strong> <code>{shippingPolicy ?? 'unset'}</code>
        </p>
        <pre style={preStyle}>{JSON.stringify(memorySnapshot, null, 2)}</pre>
      </section>
    </div>
  )
}
