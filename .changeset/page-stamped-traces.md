---
"@agentronics/sdk": patch
---

Stamp `metadata.page` on every emitted trace event. The tracer now resolves
the current page (defaulting to `location.pathname`, overridable via the new
`pageProvider` tracer option) and writes it to the reserved `metadata.page`
key unless the caller already set one. This lets the dashboard group WebMCP
tools and agent activity by page. Outside a browser (SSR / Node) no `page`
key is written, and a throwing provider can never break tracing.
