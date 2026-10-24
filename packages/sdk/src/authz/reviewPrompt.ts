import type { AgentIdentity } from '@agentronics/protocol'

/** What a "review" decision asks the person on the page to approve. */
export interface ReviewRequest {
  tool: string
  title?: string
  description?: string
  input: unknown
  identity: AgentIdentity | null
  reason: string
}

/** Return true to let the tool run, false to refuse it. */
export type Reviewer = (request: ReviewRequest) => Promise<boolean>

export interface ReviewPromptOptions {
  documentRef?: Document
  /** Refuse automatically if nobody answers. Default 120 s. */
  timeoutMs?: number
}

const summarise = (input: unknown): string => {
  if (input === null || typeof input !== 'object') return ''
  const lines = Object.entries(input as Record<string, unknown>)
    .slice(0, 6)
    .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`.slice(0, 90))
  return lines.join('\n')
}

/**
 * The default browser reviewer: a small modal asking the visitor to allow or
 * refuse the agent's action. Resolves false without a document (server), on
 * "Not now", on Escape, or after the timeout.
 */
export const createReviewPrompt = ({
  documentRef = typeof document === 'undefined' ? undefined : document,
  timeoutMs = 120_000,
}: ReviewPromptOptions = {}): Reviewer => {
  return (request) =>
    new Promise<boolean>((resolve) => {
      if (!documentRef?.body) return resolve(false)
      const doc = documentRef

      const backdrop = doc.createElement('div')
      backdrop.setAttribute('data-agentronics-review', 'true')
      Object.assign(backdrop.style, {
        position: 'fixed',
        inset: '0',
        zIndex: '2147483647',
        background: 'rgba(7,9,26,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      })

      const dialog = doc.createElement('div')
      dialog.setAttribute('role', 'dialog')
      dialog.setAttribute('aria-modal', 'true')
      dialog.setAttribute('aria-label', 'Approve agent action')
      Object.assign(dialog.style, {
        width: 'min(440px, 100%)',
        background: '#FFFFFF',
        color: '#0F172A',
        borderRadius: '12px',
        padding: '20px',
        boxShadow: '0 24px 60px -20px rgba(7,9,26,0.6)',
        font: "14px/1.5 system-ui, -apple-system, 'Segoe UI', sans-serif",
      })

      const heading = doc.createElement('div')
      heading.style.fontWeight = '700'
      heading.style.fontSize = '16px'
      const who = request.identity?.vendor ?? 'An AI agent'
      heading.textContent = `${who} wants to ${request.title ?? request.tool}`

      const body = doc.createElement('div')
      body.style.margin = '8px 0 0'
      body.style.color = '#475569'
      body.textContent = request.description ?? 'Allow this action on your behalf?'

      const details = doc.createElement('pre')
      const summary = summarise(request.input)
      Object.assign(details.style, {
        display: summary ? 'block' : 'none',
        margin: '12px 0 0',
        padding: '10px 12px',
        background: '#F1F5F9',
        borderRadius: '8px',
        fontSize: '12px',
        whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere',
      })
      details.textContent = summary

      const row = doc.createElement('div')
      Object.assign(row.style, { display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' })
      const button = (label: string, primary: boolean) => {
        const b = doc.createElement('button')
        b.type = 'button'
        b.textContent = label
        Object.assign(b.style, {
          padding: '8px 14px',
          borderRadius: '8px',
          border: primary ? '1px solid #4F46E5' : '1px solid #CBD5E1',
          background: primary ? '#4F46E5' : '#FFFFFF',
          color: primary ? '#FFFFFF' : '#0F172A',
          font: 'inherit',
          fontWeight: '600',
          cursor: 'pointer',
        })
        return b
      }
      const deny = button('Not now', false)
      const allow = button('Allow', true)
      row.append(deny, allow)
      dialog.append(heading, body, details, row)
      backdrop.append(dialog)

      let settled = false
      const finish = (ok: boolean) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        doc.removeEventListener('keydown', onKey, true)
        backdrop.remove()
        resolve(ok)
      }
      const onKey = (event: KeyboardEvent) => {
        if (event.key === 'Escape') finish(false)
      }
      const timer = setTimeout(() => finish(false), timeoutMs)
      allow.addEventListener('click', () => finish(true))
      deny.addEventListener('click', () => finish(false))
      doc.addEventListener('keydown', onKey, true)
      doc.body.appendChild(backdrop)
      allow.focus()
    })
}
