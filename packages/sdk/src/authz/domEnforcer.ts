import type { AgentIdentity } from '@agentronics/protocol'
import { showDenyOverlay } from './overlay.js'
import type { PolicyEngine } from './engine.js'

export interface DomEnforcerOptions {
  policyEngine: PolicyEngine
  getIdentity: () => AgentIdentity | null | Promise<AgentIdentity | null>
  documentRef?: Document
  selector?: string
}

export const installDomEnforcer = ({
  policyEngine,
  getIdentity,
  documentRef = typeof document === 'undefined' ? undefined : document,
  selector = '[data-agentronics-tool]',
}: DomEnforcerOptions) => {
  if (!documentRef) return { uninstall: () => undefined }

  const handler = (event: Event) => {
    const target = event.target instanceof Element ? event.target.closest(selector) : null
    if (!(target instanceof HTMLElement)) return
    const tool = target.dataset.agentronicsTool
    if (!tool) return

    void Promise.resolve(getIdentity()).then((identity) => {
      const evaluation = policyEngine.evaluate({ tool, identity })
      if (evaluation.decision !== 'deny') return
      event.preventDefault()
      event.stopPropagation()
      showDenyOverlay({ message: evaluation.reason, documentRef })
    })
  }

  documentRef.addEventListener('click', handler, true)
  return {
    uninstall: () => documentRef.removeEventListener('click', handler, true),
  }
}
