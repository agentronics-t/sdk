# Agentronics SDK

> The universal governance layer for agent-surfable websites.

`agentronics-t/sdk` is the public monorepo for the Agentronics SDK — a browser-side toolkit that lets enterprise sites govern how AI agents (WebMCP-native, DOM-driving, and screenshot-driving) discover and execute tools, prove identity, respect site policy, and emit observability traces.

## Packages

| Package | Description | Status |
|---|---|---|
| [`@agentronics/protocol`](./packages/protocol) | Browser-safe DTOs and Zod schemas shared between SDK and gateway. | v0.1.0 |
| [`@agentronics/sdk`](./packages/sdk) | Browser SDK — detection, auth, authz, memory, observability, tool management. | v0.1.0 |
| [`@agentronics/react`](./packages/react) | React hooks + provider for the SDK. | v0.1.0 |
| [`@agentronics/gateway`](./packages/gateway) | Hono control-plane API (private, deployed to `gateway.agentronics.dev`). | v0.1.0 |
| [`@agentronics/theme`](./packages/theme) | Design tokens shared across SDK apps. | internal |

## Apps

| App | Purpose | Deploy |
|---|---|---|
| [`apps/demo`](./apps/demo) | Live WebMCP demo — proves the SDK works end-to-end. | `demo.agentronics.dev` |
| [`apps/docs`](./apps/docs) | Documentation site (Next.js + Fumadocs). | `docs.agentronics.dev` |
| [`apps/dashboard`](./apps/dashboard) | Customer dashboard for keys, traces, settings. | `dashboard.agentronics.dev` |

## Getting started

```bash
pnpm install
pnpm dev               # starts all apps in parallel
```

Required: Node 20.9+ (see `.nvmrc`), pnpm 9.

## Quick install (for SDK consumers)

```bash
npm install @agentronics/sdk
```

```ts
import { Agentronics } from '@agentronics/sdk'

const client = Agentronics.init({
  publishableKey: 'agtx_pk_…',
  siteId: 'your-site',
})
```

Full quickstart: [docs.agentronics.dev/getting-started](https://docs.agentronics.dev/getting-started).

## Project structure

```
apps/
  demo/         WebMCP demo (Vite + React)
  docs/         Documentation site (Next.js + Fumadocs)
  dashboard/    Customer dashboard (Next.js + Clerk)
packages/
  protocol/     Shared DTOs (Zod schemas, browser-safe)
  sdk/          Browser SDK (tsup → ESM/CJS/IIFE)
  react/        React adapter (provider + hooks)
  gateway/      Hono control plane (Node)
  theme/        Design tokens
.github/
  workflows/    CI, E2E, release (npm Trusted Publishing), gateway deploy
.changeset/     Versioning + changelog automation
```

## Bundle budgets

Enforced in CI via `size-limit`:

| Bundle | Limit | Current |
|---|---|---|
| `lite` (WebMCP-only entrypoint) | 8 KB | 461 B |
| `full` (everything) | 30 KB | 22.79 KB |
| `react` (bindings only, gzipped) | 2 KB | 526 B |
| `init-only` (Agentronics.init reachable graph) | 25 KB | 22.39 KB |

## Scripts

```bash
pnpm typecheck    # tsc --noEmit across all packages
pnpm lint         # eslint across all packages
pnpm test         # vitest suites across all packages
pnpm build        # tsup builds for libs + Next/Vite builds for apps
pnpm size         # size-limit budget check
pnpm test:e2e     # Playwright suite (requires built apps)
```

## Planning + retrospectives

The build plan, deployment runbook, detection spike, and append-only retrospective log live in a separate repo:

- [`agentronics-t/mds`](https://github.com/agentronics-t/mds) — all planning + tracking docs

## License

[Apache License 2.0](./LICENSE) for the SDK source code. See also [`NOTICE`](./NOTICE).

The Agentronics gateway / control-plane backend is a separate, proprietary product and is not covered by this license. The SDK is designed to operate against `https://gateway.agentronics.dev/`; sign up at [agentronics.dev](https://agentronics.dev) to issue API keys.
