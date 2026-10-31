---
'@agentronics/sdk': patch
---

WebMCP tool calls no longer crash when an agent calls `execute(args)` without the options object (the "Cannot destructure property 'signal' of undefined" error every tool returned in some agent workbenches). Calls through the SDK now also: accept arguments as a JSON string; answer errors, denied rules and refused reviews as `{ error }` values instead of exceptions; always return a JSON-safe result (`undefined` → `{ ok: true }`, a returned `Response` is read); and abort calls that run longer than `toolTimeoutMs` (default 30 s).
