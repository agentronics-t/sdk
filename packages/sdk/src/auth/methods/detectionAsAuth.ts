import type { AgentIdentity } from '@agentronics/protocol'
import type { AuthMethod } from '../engine.js'

export const detectionAsAuth = (): AuthMethod => ({
  name: 'detection',
  async authenticate(input) {
    return input.detected ?? null
  },
})

export const cloneDetectedIdentity = (identity: AgentIdentity): AgentIdentity => ({
  ...identity,
  signals: { ...identity.signals },
})
