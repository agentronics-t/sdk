---
'@agentronics/sdk': minor
'@agentronics/protocol': minor
---

Pillars v2 — follows the October 2026 WebMCP draft and tightens every pillar.

- **WebMCP:** tools register with `document.modelContext.registerTool()` (async, unregistered via `AbortSignal`), with `title`, `annotations` (`readOnlyHint`, `consequentialHint`, `untrustedContentHint`) and `exposedTo`. `navigator.modelContext` is only a fallback. `publishToWebMcp()` now returns `registrations` with each tool's status (callable / failed). A WebMCP agent is detected when it activates or calls a tool — the API existing is no longer treated as an agent.
- **Detection:** new vision-model ("screenshot") agent detector (teleport / centre clicks, metronome typing), on by default with `autoDetect`; more automation-framework markers.
- **Authentication:** verified crawlers now also use vendors' published IP ranges (GPTBot, ChatGPT-User, OAI-SearchBot, PerplexityBot, Googlebot, Bingbot, …). OAuth 2.1: several issuers, delegated tokens (`onBehalfOf`, RFC 8693 `act`), DPoP-bound tokens (RFC 9449), protected-resource metadata + `WWW-Authenticate` helpers (RFC 9728). **Breaking:** browser-side tokens nothing has verified are now `declared`, not `verified`; SSO / SPIFFE / mTLS are off by default (`previewAuthMethods()`).
- **Authorization:** `review` now asks the person on the page (default dialog, or your own `review` function) and never runs the tool without approval; no matching rule now means `allow`.
- **Console sync:** `createDashboardSync()` gains `pullConfig()` (policies + approved tool descriptions) and `keyVerifier()` (live agent-key checks); `init({ toolDescriptions })` applies approved descriptions; `createTraceRelay()` forwards browser traces with the ingest key.
- **New API:** `gateway.agentronics.dev` is retired; the SDK calls `https://api.agentronics.dev/v1/pub/*` with console-issued publishable keys (the old URL maps to the new one). `client.syncConfig()` pulls rules, approved descriptions and site memory.
- **Upgrade path:** `compat: '0.6'` keeps the 0.6 behaviour (with a warning) while you move. Guide: /docs/guides/upgrade-0-7.
