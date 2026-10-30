---
"@agentronics/sdk": patch
---

Browser traces are sent in batches (every 2 s, when 50 are queued, and when the page is hidden or closed, with `keepalive`) instead of one request per event, so busy sites stay within the API's rate limit. The exporter never throws into the page and keeps at most 500 events while the API is unreachable.
