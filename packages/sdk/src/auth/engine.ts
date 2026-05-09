import type {
  AgentClass,
  AgentIdentity,
  IdentityClaim,
  VerificationResult,
} from '@agentronics/protocol'
import type { TraceInput } from '../observability/tracer.js'
import { highestTrust } from './trustLevel.js'
import { bearer } from './methods/bearer.js'
import { detectionAsAuth } from './methods/detectionAsAuth.js'
import { extensionToken } from './methods/extensionToken.js'
import { oauth2 } from './methods/oauth2.js'
import { selfDeclaration } from './methods/selfDeclaration.js'
import { sessionLink } from './methods/sessionLink.js'
import { xAgentHeader } from './methods/xAgentHeader.js'

export type AuthMethodName =
  | 'detection'
  | 'selfDeclaration'
  | 'bearer'
  | 'xAgentHeader'
  | 'extensionToken'
  | 'sessionLink'
  | 'oauth2'

export interface AuthInput {
  detected?: AgentIdentity | null
  declaration?: IdentityClaim
  bearerToken?: string
  xAgentHeader?: string
  extensionToken?: string
  sessionLinkToken?: string
  linkedUserId?: string
  oauth2AccessToken?: string
  oauth2Subject?: string
  vendorHint?: string
  classHint?: AgentClass
}

export interface AuthContext {
  verifyToken?: (
    method: Exclude<AuthMethodName, 'detection' | 'selfDeclaration' | 'xAgentHeader'>,
    token: string
  ) => Promise<VerificationResult | null>
}

export interface AuthMethod {
  name: AuthMethodName
  authenticate(input: AuthInput, context: AuthContext): Promise<AgentIdentity | null>
}

export interface AuthEngineOptions {
  methods?: AuthMethod[]
  context?: AuthContext
  onTrace?: (input: TraceInput) => void
}

export const defaultAuthMethods = (): AuthMethod[] => [
  detectionAsAuth(),
  selfDeclaration(),
  bearer(),
  xAgentHeader(),
  extensionToken(),
  sessionLink(),
  oauth2(),
]

export const createAuthEngine = ({
  methods = defaultAuthMethods(),
  context = {},
  onTrace,
}: AuthEngineOptions = {}) => ({
  async authenticate(input: AuthInput): Promise<AgentIdentity | null> {
    const identities: AgentIdentity[] = []
    const methodResults: Record<string, boolean> = {}

    for (const method of methods) {
      const identity = await method.authenticate(input, context)
      methodResults[method.name] = Boolean(identity)
      if (identity) identities.push(identity)
    }

    const identity = highestTrust(identities)
    const trace: TraceInput = {
      type: identity ? 'auth.identity_presented' : 'sdk.error',
      agent: identity,
      outcome: identity ? 'success' : 'error',
      metadata: { methods: methodResults },
    }
    if (!identity) trace.error = 'No auth method produced an identity.'
    onTrace?.(trace)
    return identity
  },

  methods(): AuthMethodName[] {
    return methods.map((method) => method.name)
  },
})

export type AuthEngine = ReturnType<typeof createAuthEngine>
