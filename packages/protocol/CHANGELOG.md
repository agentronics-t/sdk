# @agentronics/protocol

## 0.5.0

### Minor Changes

- 28cf369: Pillars v2 — follows the October 2026 WebMCP draft and tightens every pillar.

  - **WebMCP:** tools register with `document.modelContext.registerTool()` (async, unregistered via `AbortSignal`), with `title`, `annotations` (`readOnlyHint`, `consequentialHint`, `untrustedContentHint`) and `exposedTo`. `navigator.modelContext` is only a fallback. `publishToWebMcp()` now returns `registrations` with each tool's status (callable / failed). A WebMCP agent is detected when it activates or calls a tool — the API existing is no longer treated as an agent.
  - **Detection:** new vision-model ("screenshot") agent detector (teleport / centre clicks, metronome typing), on by default with `autoDetect`; more automation-framework markers.
  - **Authentication:** verified crawlers now also use vendors' published IP ranges (GPTBot, ChatGPT-User, OAI-SearchBot, PerplexityBot, Googlebot, Bingbot, …). OAuth 2.1: several issuers, delegated tokens (`onBehalfOf`, RFC 8693 `act`), DPoP-bound tokens (RFC 9449), protected-resource metadata + `WWW-Authenticate` helpers (RFC 9728). **Breaking:** browser-side tokens nothing has verified are now `declared`, not `verified`; SSO / SPIFFE / mTLS are off by default (`previewAuthMethods()`).
  - **Authorization:** `review` now asks the person on the page (default dialog, or your own `review` function) and never runs the tool without approval; no matching rule now means `allow`.
  - **Console sync:** `createDashboardSync()` gains `pullConfig()` (policies + approved tool descriptions) and `keyVerifier()` (live agent-key checks); `init({ toolDescriptions })` applies approved descriptions; `createTraceRelay()` forwards browser traces with the ingest key.
  - **New API:** `gateway.agentronics.dev` is retired; the SDK calls `https://api.agentronics.dev/v1/pub/*` with console-issued publishable keys (the old URL maps to the new one). `client.syncConfig()` pulls rules, approved descriptions and site memory.
  - **Upgrade path:** `compat: '0.6'` keeps the 0.6 behaviour (with a warning) while you move. Guide: /docs/guides/upgrade-0-7.

## 0.4.0

### Minor Changes

- 9fd37f9: Authenticate agents from the HTTP request — `@agentronics/sdk/server` and `@agentronics/sdk/next`.

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

## 0.3.0

### Minor Changes

- c46536b: Add a fourth agent class: crawlers.

  - `@agentronics/protocol`: `AgentClass` now includes `crawler`.
  - `@agentronics/sdk`: new `detectCrawler()` identifies known AI and search
    crawlers (GPTBot, ClaudeBot, PerplexityBot, Googlebot, Bingbot, …) by their
    User-Agent token, wired into `detectAgent()` between WebMCP and DOM detection
    (and as a bundled `crawler.user-agent` detector). UA is spoofable and only
    JS-executing crawlers are visible client-side, so matches report
    `confidence: 0.9`. `declareAgent()` now accepts `class: 'crawler'`.

## 0.2.0

### Minor Changes

- 98aedb9: Tool registry sync + site-memory dashboard support.

  - `@agentronics/protocol`: add `ToolDescriptor` / `ToolRegistry` wire schemas.
  - `@agentronics/sdk`: `client.syncTools()` pushes the registered tools (page,
    group, input/output schema, per-tool token estimate) to the gateway so the
    dashboard can render the page-wise Tool management view; `registerTool` now
    accepts an optional `outputSchema`.

## 0.1.1

### Patch Changes

- c005def: Add enterprise auth protocol support — SSO (OIDC), SPIFFE (JWT-SVID), Google Agent Identity, and mTLS.

  **@agentronics/protocol** — new additive exports:

  - `AuthProtocol` enum covering the full set of methods (bearer, oauth2, sso, spiffe, google-agent, mtls, plus the existing five)
  - `VerificationRequest` schema — the body shape gateway verify routes accept (`siteId`, `token?`, `xfcc?`)
  - `VerificationResult` extended with optional `subject`, `protocol`, and `signals` (the previous trust/vendor/validUntil fields are unchanged)
  - Per-protocol config schemas: `SsoConfigInput`, `SpiffeConfigInput`, `MtlsConfigInput`, `SiteProtocolName` — shared by the gateway routes and the dashboard forms

  **@agentronics/sdk** — three new auth methods registered in the default engine and three new fields on `AuthInput`:

  - `sso()` — accepts `ssoIdToken`, forwards to the gateway for OIDC discovery + JWT verification, vendor derived from the IdP issuer host
  - `spiffe()` — accepts `spiffeJwt`, forwards for SPIFFE Bundle JWKS verification. Auto-relabels the trace protocol to `google-agent` when the gateway flags `vendor: 'google'` (matched against per-site Google trust domains)
  - `mtls()` — Node-only path that forwards a raw `xfccHeader` (Envoy's `x-forwarded-client-cert`) for chain validation against site-registered roots. Lifts SPIFFE X.509-SVID URIs into `signals.spiffeId` when present
  - Engine adds `protocol` and `subject` to `auth.identity_presented` trace metadata so the dashboard can pivot/filter by protocol

  No breaking changes — all additions are optional fields and new methods slot into the existing engine ordering at the end. Existing `bearer`, `oauth2`, and the other six methods continue to behave identically.

## 0.1.0

### Minor Changes

- v0.1.0 — first publishable release. Zod schemas + types pinned to the SDK
  release surface.
- Complete the SDK governance substrate through observability, auth, and
  authz: shared DTOs for trace exporters, auth method registry, policy
  cache, rate limits, DOM enforcement, governed tool registration, and the
  detector registry.
