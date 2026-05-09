import { createContext, useContext, useState, type ReactNode } from 'react'
import { init, type AgentronicsClient, type InitOptions } from '@agentronics/sdk'

const AgentronicsContext = createContext<AgentronicsClient | null>(null)

export interface AgentronicsProviderProps extends InitOptions {
  children: ReactNode
}

export const AgentronicsProvider = ({ children, ...options }: AgentronicsProviderProps) => {
  const [client] = useState(() => init(options))
  return <AgentronicsContext.Provider value={client}>{children}</AgentronicsContext.Provider>
}

export const useAgentronics = (): AgentronicsClient => {
  const client = useContext(AgentronicsContext)
  if (!client) {
    throw new Error(
      'useAgentronics() must be called inside <AgentronicsProvider>. Wrap your app with the provider first.'
    )
  }
  return client
}
