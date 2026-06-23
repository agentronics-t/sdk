import { createFromSource } from 'fumadocs-core/search/server'
import { source } from '../../../../lib/source'

// Orama search index over the docs source. Lives UNDER /docs/* so the marketing
// site's multi-zone rewrite (/docs/:path+ → docs zone) proxies it — a route at
// the zone root (/api/search) would resolve to the landing app instead. The
// client is pointed here via RootProvider search.options.api in app/layout.tsx.
export const { GET } = createFromSource(source)
