'use client'

import { useState, useTransition, type CSSProperties } from 'react'
import { issueKeyAction, type IssuedKeys } from './actions'

const PUBLIC_GATEWAY_URL =
  process.env.NEXT_PUBLIC_GATEWAY_URL?.replace(/\/$/, '') ?? 'https://gateway.agentronics.dev'

const codeBlockStyle: CSSProperties = {
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: '0.75rem 0.9rem',
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  color: 'var(--text)',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
  margin: 0,
}

const sectionLabelStyle: CSSProperties = {
  fontSize: 11,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--accent-strong)',
  fontWeight: 700,
  marginBottom: 4,
}

const initSnippet = (publishableKey: string, siteId: string) =>
  `import { Agentronics } from '@agentronics/sdk'

Agentronics.init({
  publishableKey: '${publishableKey}',
  siteId: '${siteId}',
  trace: { gateway: true },
})`

const curlSnippet = (secretKey: string) =>
  `curl -H "Authorization: Bearer ${secretKey}" \\\n  ${PUBLIC_GATEWAY_URL}/v1/health`

const CopyButton = ({ value }: { value: string }) => {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(value)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1400)
      }}
      style={{
        padding: '4px 10px',
        border: '1px solid var(--border-strong)',
        borderRadius: 6,
        background: copied ? 'var(--accent)' : 'var(--bg-elevated)',
        color: copied ? 'var(--accent-on)' : 'var(--text)',
        fontSize: 11,
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

export const IssueForm = () => {
  const [pending, startTransition] = useTransition()
  const [issued, setIssued] = useState<(IssuedKeys & { siteId: string }) | null>(null)
  const [error, setError] = useState<string | null>(null)

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          const fd = new FormData(e.currentTarget)
          setError(null)
          startTransition(async () => {
            try {
              const result = await issueKeyAction(fd)
              const siteId = String(fd.get('siteId') ?? 'shop-acme-com').trim() || 'shop-acme-com'
              setIssued({ ...result, siteId })
            } catch (err) {
              setError((err as Error).message)
            }
          })
        }}
        style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'center' }}
      >
        <input
          name="label"
          placeholder="Label, e.g. production"
          required
          style={{
            padding: '8px 10px',
            border: '1px solid var(--border-strong)',
            borderRadius: 6,
            background: 'var(--bg-elevated)',
            color: 'var(--text)',
          }}
        />
        <input
          name="siteId"
          placeholder="siteId, e.g. shop-acme-com"
          defaultValue="shop-acme-com"
          style={{
            padding: '8px 10px',
            border: '1px solid var(--border-strong)',
            borderRadius: 6,
            background: 'var(--bg-elevated)',
            color: 'var(--text)',
          }}
        />
        <button
          type="submit"
          disabled={pending}
          style={{
            padding: '8px 16px',
            border: 'none',
            borderRadius: 6,
            background: pending ? 'var(--border-strong)' : 'var(--accent)',
            color: 'var(--accent-on)',
            fontWeight: 700,
            cursor: pending ? 'wait' : 'pointer',
          }}
        >
          {pending ? 'Issuing…' : 'Issue key pair'}
        </button>
      </form>
      {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}

      {issued && (
        <div
          style={{
            background: 'var(--bg-muted)',
            border: '1px solid var(--accent)',
            borderRadius: 'var(--radius)',
            padding: '1rem',
            display: 'grid',
            gap: 14,
          }}
        >
          <div>
            <strong style={{ color: 'var(--highlight)' }}>
              Save the secret key now — it won&apos;t be shown again.
            </strong>
            <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 12 }}>
              Publishable keys are safe in browser bundles. Secret keys are server-only.
            </p>
          </div>

          <div>
            <div style={sectionLabelStyle}>Publishable key (browser-safe)</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <pre style={{ ...codeBlockStyle, flex: 1 }}>{issued.publishable.key}</pre>
              <CopyButton value={issued.publishable.key} />
            </div>
          </div>

          <div>
            <div style={sectionLabelStyle}>Secret key (server-only)</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <pre style={{ ...codeBlockStyle, flex: 1 }}>{issued.secret.key}</pre>
              <CopyButton value={issued.secret.key} />
            </div>
          </div>

          <div>
            <div style={sectionLabelStyle}>SDK init — paste into your app entry</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <pre style={{ ...codeBlockStyle, flex: 1 }}>
                {initSnippet(issued.publishable.key, issued.siteId)}
              </pre>
              <CopyButton value={initSnippet(issued.publishable.key, issued.siteId)} />
            </div>
          </div>

          <div>
            <div style={sectionLabelStyle}>Verify the secret key against the gateway</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <pre style={{ ...codeBlockStyle, flex: 1 }}>{curlSnippet(issued.secret.key)}</pre>
              <CopyButton value={curlSnippet(issued.secret.key)} />
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIssued(null)}
            style={{
              justifySelf: 'start',
              padding: '6px 14px',
              border: '1px solid var(--border-strong)',
              borderRadius: 6,
              background: 'var(--bg-elevated)',
              color: 'var(--text)',
              cursor: 'pointer',
            }}
          >
            I saved them — dismiss
          </button>
        </div>
      )}
    </div>
  )
}
