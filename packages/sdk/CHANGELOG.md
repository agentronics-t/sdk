# @agentronics/sdk

## 0.4.0

### Minor Changes

- 0f05780: Add `createIntelExporter` — stream governed-action traces to the Agentronics
  Intelligence dashboard. Point it at your intel-api URL with a per-tenant SDK
  ingest key (`agtx_ik_…`, minted in dashboard Settings) and the SDK's tracer will
  POST `TraceBatch`es to `/v1/sdk/events`. Backend/server use only (the key is
  secret); the browser SDK should forward traces to your backend, which relays.

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

### Patch Changes

- Updated dependencies [c46536b]
  - @agentronics/protocol@0.3.0

## 0.2.0

### Minor Changes

- 98aedb9: Tool registry sync + site-memory dashboard support.

  - `@agentronics/protocol`: add `ToolDescriptor` / `ToolRegistry` wire schemas.
  - `@agentronics/sdk`: `client.syncTools()` pushes the registered tools (page,
    group, input/output schema, per-tool token estimate) to the gateway so the
    dashboard can render the page-wise Tool management view; `registerTool` now
    accepts an optional `outputSchema`.

### Patch Changes

- Updated dependencies [98aedb9]
  - @agentronics/protocol@0.2.0

## 0.1.2

### Patch Changes

- 1a718f2: Stamp `metadata.page` on every emitted trace event. The tracer now resolves
  the current page (defaulting to `location.pathname`, overridable via the new
  `pageProvider` tracer option) and writes it to the reserved `metadata.page`
  key unless the caller already set one. This lets the dashboard group WebMCP
  tools and agent activity by page. Outside a browser (SSR / Node) no `page`
  key is written, and a throwing provider can never break tracing.
- 1a718f2: `tool.executed` traces now carry `durationMs` and report failures. The tool
  registry times every execution and emits the trace on both paths: a
  successful call records its latency, and a tool that throws is traced with
  `outcome: 'error'` and the error message before the error re-throws (it was
  previously untraced entirely). This is what the dashboard's analytics needs
  to compute tool-execution latency percentiles and an accurate error rate.

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

- Updated dependencies [c005def]
  - @agentronics/protocol@0.1.1

## 0.1.0

### Minor Changes

- v0.1.0 — first publishable release. Six pillars wired through
  `Agentronics.init()`: detection (WebMCP / DOM / screenshot), auth
  normalization with `detection-as-auth`, policy engine with DOM enforcer +
  deny overlay, site memory with `<meta>` / overlay / well-known delivery,
  observability with console / gateway / webhook exporters, and tool
  surfacing with progression + token budgets. Three bundle entrypoints
  (`index`, `lite`, `init-only` budget probe) gated by `pnpm size`.
- Complete the SDK governance substrate through observability, auth, and
  authz: trace exporters, auth method registry, policy cache, rate limits,
  DOM enforcement, governed tool registration, detector registry, and lite
  package boundary fixes.

### Patch Changes

- Updated dependencies
  - @agentronics/protocol@0.1.0
