import type { TraceInput } from '../observability/tracer.js'

export interface ProgressionTransition {
  on: string
  to: string
}

export interface ProgressionStage {
  name: string
  enables?: string[]
  transitions?: ProgressionTransition[]
}

export interface ProgressionConfig {
  initial: string
  stages: ProgressionStage[]
}

export interface ProgressionStore {
  current(): string
  enabledStages(): string[]
  notify(toolName: string): { changed: boolean; from: string; to: string }
  set(stage: string): { changed: boolean; from: string; to: string }
  reset(): void
  snapshot(): { current: string; enabled: string[] }
}

export const createProgressionStore = (
  config: ProgressionConfig,
  options: { onTrace?: (input: TraceInput) => void } = {}
): ProgressionStore => {
  const stageMap = new Map<string, ProgressionStage>()
  for (const stage of config.stages) stageMap.set(stage.name, stage)
  if (!stageMap.has(config.initial)) {
    throw new Error(`Initial stage "${config.initial}" is not declared in progression stages.`)
  }

  let current = config.initial

  const enabled = (): string[] => {
    const stage = stageMap.get(current)
    return stage?.enables ? [current, ...stage.enables] : [current]
  }

  const transitionTo = (next: string, trigger: string): { changed: boolean; from: string; to: string } => {
    const from = current
    if (!stageMap.has(next)) {
      throw new Error(`Cannot transition to unknown stage "${next}".`)
    }
    if (next === current) return { changed: false, from, to: next }
    current = next
    options.onTrace?.({
      type: 'tool.progressed',
      metadata: { from, to: next, trigger },
    })
    return { changed: true, from, to: next }
  }

  return {
    current: () => current,
    enabledStages: () => enabled(),
    notify(toolName) {
      const stage = stageMap.get(current)
      const transition = stage?.transitions?.find((t) => t.on === toolName)
      if (!transition) return { changed: false, from: current, to: current }
      return transitionTo(transition.to, toolName)
    },
    set(stage) {
      return transitionTo(stage, 'manual')
    },
    reset() {
      const previous = current
      current = config.initial
      if (previous !== current) {
        options.onTrace?.({
          type: 'tool.progressed',
          metadata: { from: previous, to: current, trigger: 'reset' },
        })
      }
    },
    snapshot: () => ({ current, enabled: enabled() }),
  }
}
