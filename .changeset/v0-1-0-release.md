---
"@agentronics/protocol": minor
"@agentronics/sdk": minor
"@agentronics/react": minor
---

v0.1.0 — first publishable release.

- **`@agentronics/sdk`** — Six pillars wired through `Agentronics.init()`: detection (WebMCP / DOM / screenshot), auth normalization with `detection-as-auth`, policy engine with DOM enforcer + deny overlay, site memory with `<meta>` / overlay / well-known delivery, observability with console / gateway / webhook exporters, and tool surfacing with progression + token budgets. Three bundle entrypoints (`index`, `lite`, `init-only` budget probe) gated by `pnpm size`.
- **`@agentronics/react`** — `<AgentronicsProvider>`, `useAgentronics`, `useGovernedTool`, `useAgentContext`, `useSiteMemory`, all built on `useSyncExternalStore` against the SDK's subscribe/snapshot stores.
- **`@agentronics/protocol`** — Zod schemas + types pinned to the SDK release surface.

See [`reference/changelog`](https://docs.agentronics.dev/docs/reference/changelog) for the full inventory.
