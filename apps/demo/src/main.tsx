import React from 'react'
import ReactDOM from 'react-dom/client'
import { AgentronicsProvider } from '@agentronics/react'
import { App } from './App'
import './theme.css'

const PUBLISHABLE_KEY =
  import.meta.env.VITE_AGENTRONICS_KEY ?? 'agtx_pk_demo_local_development_only'
const GATEWAY_URL = import.meta.env.VITE_AGENTRONICS_GATEWAY_URL
const ENABLE_GATEWAY_TRACES = import.meta.env.VITE_AGENTRONICS_GATEWAY_TRACES === 'true'
const SITE_ID = import.meta.env.VITE_AGENTRONICS_SITE_ID ?? 'demo-site'

const PROGRESSION = {
  initial: 'browse',
  stages: [
    { name: 'browse', transitions: [{ on: 'cart.add', to: 'checkout' }] },
    { name: 'checkout' },
  ],
}

const providerProps = {
  publishableKey: PUBLISHABLE_KEY,
  siteId: SITE_ID,
  progression: PROGRESSION,
  debug: true,
  ...(GATEWAY_URL ? { gatewayUrl: GATEWAY_URL } : {}),
  ...(ENABLE_GATEWAY_TRACES ? { trace: { gateway: true } as const } : {}),
}

if (typeof window !== 'undefined') {
  console.info('[demo] Agentronics initialized')
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AgentronicsProvider {...providerProps}>
      <App />
    </AgentronicsProvider>
  </React.StrictMode>
)
