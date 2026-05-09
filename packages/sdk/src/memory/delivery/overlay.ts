import type { SiteMemory } from '@agentronics/protocol'

const OVERLAY_ID = 'agentronics-memory-overlay'

export interface MemoryOverlayOptions {
  doc?: Document
  snapshot: SiteMemory
  hidden?: boolean
}

const styles = (hidden: boolean): string => `
position: fixed;
bottom: 16px;
right: 16px;
max-width: 320px;
padding: 10px 12px;
background: rgba(17, 24, 39, 0.92);
color: #f9fafb;
font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;
border-radius: 8px;
z-index: 2147483647;
opacity: ${hidden ? '0' : '1'};
pointer-events: ${hidden ? 'none' : 'auto'};
box-shadow: 0 12px 32px rgba(15, 23, 42, 0.35);
`

const summarize = (snapshot: SiteMemory): string => {
  const pages = snapshot.siteMap?.pages?.length ?? 0
  const workflows = Object.keys(snapshot.workflows).length
  const ui = Object.keys(snapshot.uiGuidance).length
  return `Agentronics site memory · pages:${pages} · workflows:${workflows} · ui-hints:${ui}`
}

export const installMemoryOverlay = ({
  doc = typeof document === 'undefined' ? (null as unknown as Document) : document,
  snapshot,
  hidden = false,
}: MemoryOverlayOptions): { uninstall: () => void; refresh: (next: SiteMemory) => void } => {
  if (!doc) return { uninstall: () => {}, refresh: () => {} }

  let host = doc.getElementById(OVERLAY_ID) as HTMLDivElement | null
  if (!host) {
    host = doc.createElement('div')
    host.id = OVERLAY_ID
    host.setAttribute('role', 'note')
    host.setAttribute('aria-label', 'Agentronics site memory summary')
    host.setAttribute('data-agent-context', 'overlay')
    doc.body.appendChild(host)
  }
  host.setAttribute('style', styles(hidden))
  host.textContent = summarize(snapshot)

  return {
    uninstall: () => {
      host?.remove()
    },
    refresh: (next: SiteMemory) => {
      if (!host) return
      host.textContent = summarize(next)
    },
  }
}
