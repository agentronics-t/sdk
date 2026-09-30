/**
 * @agentronics/sdk/server — authenticate AI agents from the HTTP request.
 *
 * Works for agents that never run your page JavaScript: signed agents (Web Bot
 * Auth), API agents (agent keys, OAuth2), and crawlers (verified by reverse
 * DNS). Pair it with the browser SDK for in-page agents (WebMCP, browser agents).
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
  type AccessRules,
  type Decision,
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
export { jwkThumbprint, signatureBase, type PublicJwk, type SignatureAlgorithm } from './httpSignatures.js'
