import type { AgentIdentity } from '@agentronics/protocol'

export interface AgentContextSnapshot {
  identity: AgentIdentity | null
  source: 'detect' | 'declare' | 'authenticate' | 'cleared' | 'initial'
  updatedAt: string | null
}

export type AgentContextListener = (snapshot: AgentContextSnapshot) => void

const INITIAL: AgentContextSnapshot = {
  identity: null,
  source: 'initial',
  updatedAt: null,
}

export const createAgentContextStore = () => {
  let state: AgentContextSnapshot = INITIAL
  const listeners = new Set<AgentContextListener>()

  const notify = () => {
    if (listeners.size === 0) return
    listeners.forEach((listener) => listener(state))
  }

  return {
    snapshot(): AgentContextSnapshot {
      return state
    },
    set(identity: AgentIdentity | null, source: AgentContextSnapshot['source']) {
      state = { identity, source, updatedAt: new Date().toISOString() }
      notify()
    },
    subscribe(listener: AgentContextListener): () => void {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

export type AgentContextStore = ReturnType<typeof createAgentContextStore>
