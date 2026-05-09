import type { TraceEvent as TraceEventRecord } from '@agentronics/protocol'

export interface SamplerOptions {
  traceRate?: number
  errorRate?: number
  random?: () => number
}

const clampRate = (value: number | undefined, fallback: number): number => {
  if (value === undefined) return fallback
  return Math.max(0, Math.min(1, value))
}

export const createSampler = (options: SamplerOptions = {}) => {
  const traceRate = clampRate(options.traceRate, 1)
  const errorRate = clampRate(options.errorRate, 1)
  const random = options.random ?? Math.random

  return {
    shouldKeep(event: Pick<TraceEventRecord, 'outcome'>): boolean {
      const rate = event.outcome === 'error' ? errorRate : traceRate
      return random() < rate
    },
  }
}

export type TraceSampler = ReturnType<typeof createSampler>
