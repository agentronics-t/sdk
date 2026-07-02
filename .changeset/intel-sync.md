---
"@agentronics/sdk": minor
---

Add `createIntelSync` — push the authoritative tool registry + site-memory
snapshot to the Agentronics Intelligence dashboard (the WebMCP Tools + Knaph
pages need the full schemas/token cost + snapshot, which don't fit in the
lightweight trace stream). `pushTools(client.tools.list())` →
`POST /v1/sdk/tools`; `pushMemory(client.siteMemory.get(), score)` →
`POST /v1/sdk/memory`. Backend/server use only (the ingest key is secret).
