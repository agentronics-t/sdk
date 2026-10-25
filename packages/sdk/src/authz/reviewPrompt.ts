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
        background: 'rgba(11,11,12,0.45)',
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
        color: '#0B0B0C',
        border: '2px solid #0B0B0C',
        borderRadius: '16px',
        padding: '20px',
        boxShadow: '8px 8px 0 #0B0B0C',
        font: "14px/1.5 system-ui, -apple-system, 'Segoe UI', sans-serif",
      })

      const heading = doc.createElement('div')
      heading.style.fontWeight = '700'
      heading.style.fontSize = '16px'
      const who = request.identity?.vendor ?? 'An AI agent'
      heading.textContent = `${who} wants to ${request.title ?? request.tool}`

      const body = doc.createElement('div')
      body.style.margin = '8px 0 0'
      body.style.color = 'rgba(11,11,12,0.65)'
      body.textContent = request.description ?? 'Allow this action on your behalf?'

      const details = doc.createElement('pre')
      const summary = summarise(request.input)
      Object.assign(details.style, {
        display: summary ? 'block' : 'none',
        margin: '12px 0 0',
        padding: '10px 12px',
        background: 'rgba(11,11,12,0.06)',
        borderRadius: '10px',
        fontSize: '12px',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
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
          padding: '9px 16px',
          borderRadius: '10px',
          border: '2px solid #0B0B0C',
          // Agentronics design system: lime is the "go" action, always with ink text
          background: primary ? '#D4FF3A' : '#FFFFFF',
          color: '#0B0B0C',
          boxShadow: primary ? '3px 3px 0 #0B0B0C' : 'none',
          font: 'inherit',
          fontWeight: '650',
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
