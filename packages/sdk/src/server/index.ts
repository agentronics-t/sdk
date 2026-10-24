/**
 * @agentronics/sdk/server — authenticate AI agents from the HTTP request.
 *
 * Works for agents that never run your page JavaScript: signed agents (Web Bot
 * Auth), API agents (agent keys, OAuth 2.1 — app-only or on behalf of a user),
 * and crawlers (verified by published IP ranges or reverse DNS). Pair it with the browser SDK for in-page agents (WebMCP, browser agents).
 * It authenticates; it never blocks.
 */
export {
  createAgentAuth,
  hashAgentKey,
  staticKeyVerifier,
  generateAgentKey,
  withAgentHeaders,
  readAgentHeaders,
  toTraceEvent,
  AGENT_HEADERS,
  type AgentAuthOptions,
  type AgentAuthResult,
  type AgentAuthMethod,
  type VerifiedAgent,
  type ApiKeyOptions,
  type ApiKeyIdentity,
  type OAuth2Options,
  type CrawlerOptions,
} from './agentAuth.js'
export {
  createAgentAuthHandler,
  expressAgentAuth,
  type AgentAuthHandlerOptions,
  type HandlerOutcome,
} from './middleware.js'
export {
  verifyWebBotAuth,
  memoryReplayCache,
  WEB_BOT_AUTH_TAG,
  DIRECTORY_PATH,
  type WebBotAuthOptions,
  type WebBotAuthResult,
  type ReplayCache,
} from './webBotAuth.js'
export { classifyUserAgent, verifyCrawler, clientIp, RDNS_DOMAINS, type ClientIpSource } from './crawlers.js'
export { PUBLISHED_IP_RANGES, ipInCidr, ipInRanges, rangesFor, type IpRangeOptions } from './ipRanges.js'
export {
  protectedResourceMetadata,
  oauthChallenge,
  verifyOAuthToken,
  PROTECTED_RESOURCE_PATH,
  type ProtectedResourceOptions,
  type OAuthAgent,
} from './oauth.js'
export { jwkThumbprint, signatureBase, type PublicJwk, type SignatureAlgorithm } from './httpSignatures.js'
export { createTraceRelay, type TraceRelayOptions } from './relay.js'
export { createAgentContextHandler, type AgentContextHandlerOptions } from './agentContext.js'
