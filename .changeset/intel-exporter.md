---
"@agentronics/sdk": minor
---

Add `createIntelExporter` — stream governed-action traces to the Agentronics
Intelligence dashboard. Point it at your intel-api URL with a per-tenant SDK
ingest key (`agtx_ik_…`, minted in dashboard Settings) and the SDK's tracer will
POST `TraceBatch`es to `/v1/sdk/events`. Backend/server use only (the key is
secret); the browser SDK should forward traces to your backend, which relays.
