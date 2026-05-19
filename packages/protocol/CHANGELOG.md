# @agentronics/protocol

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
