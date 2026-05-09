import {
  TraceEvent,
  type TraceEvent as TraceEventRecord,
  type TraceEventType,
} from '@agentronics/protocol'
import { createTraceBuffer, type TraceBuffer } from './buffer.js'
import { createSampler, type SamplerOptions } from './sampler.js'
import { DEFAULT_SCRUB_PATHS, scrubValue } from './scrub.js'

export interface TraceExporter {
  name: string
  export(events: TraceEventRecord[]): Promise<void> | void
}

export interface TraceInput {
  type: TraceEventType
  outcome?: TraceEventRecord['outcome']
  tool?: string
  agent?: TraceEventRecord['agent']
  policy?: TraceEventRecord['policy']
  durationMs?: number
  error?: string
  metadata?: Record<string, unknown>
}

export interface TracerOptions extends SamplerOptions {
  siteId: string
  bufferSize?: number
  sessionId?: string
  scrubPaths?: string[]
  exporters?: TraceExporter[]
  onExporterError?: (error: unknown, exporter: TraceExporter, event: TraceEventRecord) => void
}

export interface Tracer {
  readonly sessionId: string
  emit(input: TraceInput): Promise<TraceEventRecord | null>
  list(): TraceEventRecord[]
  clear(): void
}

const randomId = (prefix: string): string => {
  const cryptoApi = globalThis.crypto
  if (cryptoApi && 'randomUUID' in cryptoApi) return `${prefix}_${cryptoApi.randomUUID()}`
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`
}

export const createTracer = ({
  siteId,
  bufferSize,
  sessionId = randomId('ses'),
  scrubPaths = DEFAULT_SCRUB_PATHS,
  exporters = [],
  onExporterError,
  ...samplerOptions
}: TracerOptions): Tracer => {
  const buffer: TraceBuffer = createTraceBuffer(bufferSize)
  const sampler = createSampler(samplerOptions)

  return {
    sessionId,
    async emit(input) {
      const event = TraceEvent.parse(
        scrubValue(
          {
            id: randomId('trc'),
            siteId,
            sessionId,
            occurredAt: new Date().toISOString(),
            outcome: input.outcome ?? 'success',
            metadata: {},
            ...input,
          },
          scrubPaths
        )
      )

      if (!sampler.shouldKeep(event)) return null
      buffer.add(event)

      await Promise.all(
        exporters.map(async (exporter) => {
          try {
            await exporter.export([event])
          } catch (error) {
            onExporterError?.(error, exporter, event)
          }
        })
      )

      return event
    },
    list: () => buffer.list(),
    clear: () => buffer.clear(),
  }
}
