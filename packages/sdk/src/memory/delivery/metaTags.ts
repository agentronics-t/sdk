import type { SiteMemory } from '@agentronics/protocol'

const META_PREFIX = 'agent-context-'
const JSONLD_ID = 'agentronics-site-context'

export interface MetaTagsOptions {
  doc?: Document
  snapshot: SiteMemory
  schemaType?: string
}

const safeJson = (value: unknown): string => {
  try {
    return JSON.stringify(value)
  } catch {
    return '{}'
  }
}

const setMeta = (doc: Document, name: string, content: string) => {
  let tag = doc.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)
  if (!tag) {
    tag = doc.createElement('meta')
    tag.setAttribute('name', name)
    doc.head.appendChild(tag)
  }
  tag.setAttribute('content', content)
}

const removeByName = (doc: Document, name: string) => {
  doc.querySelectorAll(`meta[name="${name}"]`).forEach((node) => node.remove())
}

export const installMetaTags = ({
  doc = typeof document === 'undefined' ? (null as unknown as Document) : document,
  snapshot,
  schemaType = 'WebSite',
}: MetaTagsOptions): { uninstall: () => void } => {
  if (!doc) return { uninstall: () => {} }

  setMeta(doc, `${META_PREFIX}version`, snapshot.version)
  setMeta(doc, `${META_PREFIX}updated-at`, snapshot.updatedAt ?? new Date().toISOString())
  if (snapshot.siteMap?.navigation?.flow) {
    setMeta(doc, `${META_PREFIX}flow`, snapshot.siteMap.navigation.flow)
  }
  setMeta(doc, `${META_PREFIX}workflows`, Object.keys(snapshot.workflows).join(','))

  let script = doc.getElementById(JSONLD_ID) as HTMLScriptElement | null
  if (!script) {
    script = doc.createElement('script')
    script.type = 'application/ld+json'
    script.id = JSONLD_ID
    doc.head.appendChild(script)
  }
  script.textContent = safeJson({
    '@context': 'https://schema.org',
    '@type': schemaType,
    name: 'Agentronics Site Memory',
    agentronics: snapshot,
  })

  return {
    uninstall: () => {
      removeByName(doc, `${META_PREFIX}version`)
      removeByName(doc, `${META_PREFIX}updated-at`)
      removeByName(doc, `${META_PREFIX}flow`)
      removeByName(doc, `${META_PREFIX}workflows`)
      doc.getElementById(JSONLD_ID)?.remove()
    },
  }
}
