---
"@agentronics/protocol": minor
"@agentronics/sdk": minor
---

Tool registry sync + site-memory dashboard support.

- `@agentronics/protocol`: add `ToolDescriptor` / `ToolRegistry` wire schemas.
- `@agentronics/sdk`: `client.syncTools()` pushes the registered tools (page,
  group, input/output schema, per-tool token estimate) to the gateway so the
  dashboard can render the page-wise Tool management view; `registerTool` now
  accepts an optional `outputSchema`.
