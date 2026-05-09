import type { AgentIdentity } from '@agentronics/protocol'
import { detectWebMcp, type DetectWebMcpOptions } from './webmcp.js'
import { detectDom, type DetectDomOptions } from './dom.js'
import { createDetectorRegistry, type Detector } from './detectors/registry.js'

export interface DetectAgentOptions {
  webmcp?: DetectWebMcpOptions | false
  dom?: DetectDomOptions | false
  customDetectors?: Detector[]
  experimental?: boolean
}

/**
 * Run the full detection pipeline. WebMCP wins if present (exact match), then DOM heuristics.
 * Returns `null` if no agent class fires above its threshold — caller should treat as "human or
 * undetectable agent."
 */
export const detectAgent = async (
  options: DetectAgentOptions = {}
): Promise<AgentIdentity | null> => {
  if (options.customDetectors?.length) {
    const custom = await createDetectorRegistry(options.customDetectors).detectAll(Boolean(options.experimental))
    if (custom) return custom
  }
  if (options.webmcp !== false) {
    const webmcp = await detectWebMcp(options.webmcp ?? {})
    if (webmcp) return webmcp
  }
  if (options.dom !== false) {
    const dom = detectDom(options.dom ?? {})
    if (dom) return dom
  }
  return null
}

export { detectWebMcp } from './webmcp.js'
export type { DetectWebMcpOptions } from './webmcp.js'
export { detectDom } from './dom.js'
export type { DetectDomOptions, DomSignalName } from './dom.js'
export { declareAgent } from './declare.js'
export type { DeclareAgentInput } from './declare.js'
export { createDetectorRegistry, bundledDetectors } from './detectors/registry.js'
export type { Detector, DetectorRegistry, DetectorStatus } from './detectors/registry.js'
export { createSignatureLoader } from './detectors/signatureLoader.js'
export type { DetectorSignature, SignatureLoader } from './detectors/signatureLoader.js'
