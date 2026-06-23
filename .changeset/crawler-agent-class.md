---
"@agentronics/protocol": minor
"@agentronics/sdk": minor
---

Add a fourth agent class: crawlers.

- `@agentronics/protocol`: `AgentClass` now includes `crawler`.
- `@agentronics/sdk`: new `detectCrawler()` identifies known AI and search
  crawlers (GPTBot, ClaudeBot, PerplexityBot, Googlebot, Bingbot, …) by their
  User-Agent token, wired into `detectAgent()` between WebMCP and DOM detection
  (and as a bundled `crawler.user-agent` detector). UA is spoofable and only
  JS-executing crawlers are visible client-side, so matches report
  `confidence: 0.9`. `declareAgent()` now accepts `class: 'crawler'`.
