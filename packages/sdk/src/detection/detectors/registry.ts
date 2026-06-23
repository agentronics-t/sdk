import type { AgentIdentity } from '@agentronics/protocol'
import { detectDom } from '../dom.js'
import { detectCrawler } from '../crawler.js'
import { detectWebMcp } from '../webmcp.js'

export type DetectorStatus = 'stable' | 'beta' | 'research'

export interface Detector {
  id: string
  status: DetectorStatus
  detect(): AgentIdentity | null | Promise<AgentIdentity | null>
}

export const bundledDetectors = (): Detector[] => [
  {
    id: 'webmcp.model-context',
    status: 'stable',
    detect: () => detectWebMcp({ pollMs: 0 }),
  },
  {
    id: 'crawler.user-agent',
    status: 'beta',
    detect: () => detectCrawler(),
  },
  {
    id: 'dom.automation-heuristics',
    status: 'beta',
    detect: () => detectDom(),
  },
]

export const createDetectorRegistry = (initial: Detector[] = bundledDetectors()) => {
  const detectors = new Map(initial.map((detector) => [detector.id, detector]))

  return {
    register(detector: Detector) {
      detectors.set(detector.id, detector)
    },
    list(status?: DetectorStatus): Detector[] {
      const all = [...detectors.values()]
      return status ? all.filter((detector) => detector.status === status) : all
    },
    async detectAll(includeResearch = false): Promise<AgentIdentity | null> {
      for (const detector of detectors.values()) {
        if (detector.status === 'research' && !includeResearch) continue
        const identity = await detector.detect()
        if (identity) return identity
      }
      return null
    },
  }
}

export type DetectorRegistry = ReturnType<typeof createDetectorRegistry>
