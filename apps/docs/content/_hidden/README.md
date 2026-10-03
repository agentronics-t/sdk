# Hidden docs (feature kept, not published)

Agentronics went all-in on agent authentication on 2026-09-30. These pages
document features that still ship in the SDK but are no longer part of the
product surface (WebMCP tool management, tool policies, site memory, the
general-purpose detection/observability pages).

They live outside `content/docs`, so Fumadocs doesn't route or index them.
To publish one again, `git mv` it back under `content/docs/` and add it to
the matching `meta.json`.
