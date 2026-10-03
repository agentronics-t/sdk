---
"@agentronics/sdk": minor
"@agentronics/protocol": minor
---

Authenticate agents from the HTTP request — `@agentronics/sdk/server` and `@agentronics/sdk/next`.

- **Web Bot Auth** (draft-meunier-webbotauth-httpsig-protocol-02): RFC 9421 HTTP
  message signature verification with key-directory discovery (`directory` /
  `jwks_uri`), JWK-thumbprint key selection, time-window + replay checks, and
  SSRF-guarded fetching. Verified against the draft's published Ed25519 vector.
- **Agent API keys** (`agk_…`, hashed at rest), **OAuth2** client-credentials JWTs
  (JWKS, issuer/audience/scopes), and **verified crawlers** (forward-confirmed
  reverse DNS; client IP from platform headers only).
- `createAgentAuth()` → `authenticate(request)`. Authentication never blocks:
  verified agents get a stable identity, unverified agents and humans browse as
  normal. `withAgentHeaders()` strips forged `x-agentronics-*` headers;
  `toTraceEvent()` feeds the console's auth logs.
- Drop-ins that always pass requests through: `agentronicsMiddleware()` for
  Next.js, `expressAgentAuth()` for Express, `createAgentAuthHandler()` for
  anything Fetch-based. Internal errors fall back to unauthenticated traffic.
- `createDashboardExporter` / `createDashboardSync` (preferred names;
  `createIntelExporter` / `createIntelSync` still work, now deprecated).
- protocol: `AuthProtocol` gains `web-bot-auth`, `api-key`, `verified-crawler`.
