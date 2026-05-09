import type { AgentIdentity } from '@agentronics/protocol'
import { detectWebMcp, type DetectWebMcpOptions } from './detection/webmcp.js'

const PUBLISHABLE_KEY_PREFIX = 'agtx_pk_'
const SECRET_KEY_PREFIX = 'agtx_sk_'

export interface LiteInitOptions {
  publishableKey: string
  siteId?: string
  debug?: boolean
}

export interface LiteAgentronicsClient {
  readonly publishableKey: string
  readonly siteId: string
  readonly debug: boolean
  detectWebMcp(options?: DetectWebMcpOptions): Promise<AgentIdentity | null>
}

export const init = ({
  publishableKey,
  siteId = 'default',
  debug = false,
}: LiteInitOptions): LiteAgentronicsClient => {
  if (publishableKey.startsWith(SECRET_KEY_PREFIX)) {
    throw new Error(
      'A secret key was passed to Agentronics lite init(). Browser code must use a publishable key (agtx_pk_*).'
    )
  }
  if (!publishableKey.startsWith(PUBLISHABLE_KEY_PREFIX)) {
    throw new Error(`Agentronics lite init() expected a key starting with "${PUBLISHABLE_KEY_PREFIX}".`)
  }

  return Object.freeze({
    publishableKey,
    siteId,
    debug,
    detectWebMcp,
  })
}

export { detectWebMcp } from './detection/webmcp.js'
export type { DetectWebMcpOptions } from './detection/webmcp.js'

export const VERSION = '0.1.0-lite'
