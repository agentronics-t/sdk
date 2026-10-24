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
  /**
   * `'0.6'` restores the pre-0.7 behaviour: tokens nothing has verified count
   * as `verified` (or `linked` with a user id), and SSO / SPIFFE / mTLS are in
   * the default methods. Insecure — for upgrading without changes; remove it
   * once `auth.verifyToken` is wired. See the 0.7 upgrade guide.
   */
  compat?: '0.6'
  /** Called once, the first time a credential arrives with no verifier configured. */
  onUnverifiedToken?: (method: AuthMethodName) => void
}

const TOKEN_METHODS = new Set<AuthMethodName>(['bearer', 'extensionToken', 'sessionLink', 'oauth2', 'sso', 'spiffe', 'mtls'])

/** Pre-0.7 trust for an identity no verifier checked (compat '0.6' only). */
const legacyTrust = (method: AuthMethodName, identity: AgentIdentity, input: AuthInput): AgentIdentity => {
  if (TOKEN_METHODS.has(method) && identity.signals?.verifiedRemotely === false) {
    const linked = (method === 'oauth2' && input.oauth2Subject) || (method === 'sessionLink' && input.linkedUserId)
    return { ...identity, trust: linked ? 'linked' : 'verified', signals: { ...identity.signals, compat: '0.6' } }
  }
  if (method === 'xAgentHeader' && identity.signals?.hasProof === true) {
    return { ...identity, trust: 'verified', confidence: 1, signals: { ...identity.signals, compat: '0.6' } }
  }
  return identity
}

/**
 * Methods on by default. SSO, SPIFFE (incl. Google Agent Identity) and mTLS are
 * kept but off until they ship — pass `methods: [...defaultAuthMethods(),
 * ...previewAuthMethods()]` to try them.
 */
export const defaultAuthMethods = (): AuthMethod[] => [
  detectionAsAuth(),
  selfDeclaration(),
  bearer(),
  xAgentHeader(),
  extensionToken(),
  sessionLink(),
  oauth2(),
]

/** Coming later: enterprise agent SSO, workload identity (SPIFFE) and mTLS. */
export const previewAuthMethods = (): AuthMethod[] => [sso(), spiffe(), mtls()]

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
  compat,
  methods = compat === '0.6' ? [...defaultAuthMethods(), ...previewAuthMethods()] : defaultAuthMethods(),
  context = {},
  onTrace,
  onUnverifiedToken,
}: AuthEngineOptions = {}) => {
  let warned = false
  return {
  async authenticate(input: AuthInput): Promise<AgentIdentity | null> {
    const identities: Array<{ method: AuthMethodName; identity: AgentIdentity }> = []
    const methodResults: Record<string, boolean> = {}

    for (const method of methods) {
      let identity = await method.authenticate(input, context)
      methodResults[method.name] = Boolean(identity)
      if (!identity) continue
      if (TOKEN_METHODS.has(method.name) && identity.signals?.verifiedRemotely === false && !context.verifyToken && !warned) {
        warned = true
        onUnverifiedToken?.(method.name)
      }
      if (compat === '0.6') identity = legacyTrust(method.name, identity, input)
      identities.push({ method: method.name, identity })
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
  }
}

export type AuthEngine = ReturnType<typeof createAuthEngine>
