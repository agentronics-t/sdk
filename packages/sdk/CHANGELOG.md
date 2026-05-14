# @agentronics/sdk

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
