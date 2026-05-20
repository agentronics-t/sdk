---
"@agentronics/sdk": patch
---

`tool.executed` traces now carry `durationMs` and report failures. The tool
registry times every execution and emits the trace on both paths: a
successful call records its latency, and a tool that throws is traced with
`outcome: 'error'` and the error message before the error re-throws (it was
previously untraced entirely). This is what the dashboard's analytics needs
to compute tool-execution latency percentiles and an accurate error rate.
