export interface DenyOverlayOptions {
  message?: string
  durationMs?: number
  documentRef?: Document
}

export const showDenyOverlay = ({
  message = 'Agent action blocked by site policy.',
  durationMs = 2400,
  documentRef = typeof document === 'undefined' ? undefined : document,
}: DenyOverlayOptions = {}) => {
  if (!documentRef?.body) return null

  const node = documentRef.createElement('div')
  node.setAttribute('role', 'status')
  node.setAttribute('data-agentronics-deny-overlay', 'true')
  node.textContent = message
  Object.assign(node.style, {
    position: 'fixed',
    zIndex: '2147483647',
    left: '50%',
    bottom: '24px',
    transform: 'translateX(-50%)',
    maxWidth: 'min(520px, calc(100vw - 32px))',
    padding: '12px 16px',
    borderRadius: '8px',
    background: '#07091A',
    color: '#F4F4F5',
    border: '1px solid #6366F1',
    boxShadow: '0 20px 48px -16px rgba(7,9,26,0.55)',
    font: "13px/1.45 'Space Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
  })

  documentRef.body.appendChild(node)
  window.setTimeout(() => node.remove(), durationMs)
  return node
}
