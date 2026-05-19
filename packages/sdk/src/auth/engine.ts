import type {
  AgentClass,
  AgentIdentity,
  AuthProtocol,
  IdentityClaim,
  VerificationResult,
} from '@agentronics/protocol'
import type { TraceInput } from '../observability/tracer.js'
import { highestTrust } from './trustLevel.js'
import { bearer } from './methods/bearer.js'
import { detectionAsAuth } from './methods/detectionAsAuth.js'
import { extensionToken } from './methods/extensionToken.js'
import { mtls } from './methods/mtls.js'
import { oauth2 } from './methods/oauth2.js'
import { selfDeclaration } from './methods/selfDeclaration.js'
import { sessionLink } from './methods/sessionLink.js'
import { sso } from './methods/sso.js'
import { spiffe } from './methods/spiffe.js'
import { xAgentHeader } from './methods/xAgentHeader.js'

export type AuthMethodName =
  | 'detection'
  | 'selfDeclaration'
  | 'bearer'
  | 'xAgentHeader'
  | 'extensionToken'
  | 'sessionLink'
  | 'oauth2'
  | 'sso'
  | 'spiffe'
  | 'mtls'

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
  ssoIdToken?: string
  spiffeJwt?: string
  xfccHeader?: string
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
  sso(),
  spiffe(),
  mtls(),
]

// Method-name → dashboard-facing AuthProtocol label. The spiffe method
// can override its emitted label to 'google-agent' by setting
// `signals.googleAgent = true` (see methods/spiffe.ts) — that branch is
// handled in resolveTraceProtocol() below.
const METHOD_TO_PROTOCOL: Record<AuthMethodName, AuthProtocol> = {
  detection: 'detection',
  selfDeclaration: 'declaration',
  bearer: 'bearer',
  xAgentHeader: 'x-agent-header',
  extensionToken: 'extension',
  sessionLink: 'session-link',
  oauth2: 'oauth2',
  sso: 'sso',
  spiffe: 'spiffe',
  mtls: 'mtls',
}

const resolveTraceProtocol = (
  methodName: AuthMethodName,
  identity: AgentIdentity
): AuthProtocol => {
  if (methodName === 'spiffe' && identity.signals?.googleAgent === true) {
    return 'google-agent'
  }
  return METHOD_TO_PROTOCOL[methodName]
}

export const createAuthEngine = ({
  methods = defaultAuthMethods(),
  context = {},
  onTrace,
}: AuthEngineOptions = {}) => ({
  async authenticate(input: AuthInput): Promise<AgentIdentity | null> {
    const identities: Array<{ method: AuthMethodName; identity: AgentIdentity }> = []
    const methodResults: Record<string, boolean> = {}

    for (const method of methods) {
      const identity = await method.authenticate(input, context)
      methodResults[method.name] = Boolean(identity)
      if (identity) identities.push({ method: method.name, identity })
    }

    const winner = highestTrust(identities.map((entry) => entry.identity))
    const winnerEntry = winner
      ? identities.find((entry) => entry.identity === winner)
      : undefined
    const protocol = winnerEntry
      ? resolveTraceProtocol(winnerEntry.method, winnerEntry.identity)
      : undefined
    const subject =
      typeof winner?.signals?.subject === 'string' ? winner.signals.subject : undefined

    const trace: TraceInput = {
      type: winner ? 'auth.identity_presented' : 'sdk.error',
      agent: winner,
      outcome: winner ? 'success' : 'error',
      metadata: {
        methods: methodResults,
        ...(protocol ? { protocol } : {}),
        ...(subject ? { subject } : {}),
      },
    }
    if (!winner) trace.error = 'No auth method produced an identity.'
    onTrace?.(trace)
    return winner
  },

  methods(): AuthMethodName[] {
    return methods.map((method) => method.name)
  },
})

export type AuthEngine = ReturnType<typeof createAuthEngine>
