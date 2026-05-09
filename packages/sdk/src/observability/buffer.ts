import type { TraceEvent as TraceEventRecord } from '@agentronics/protocol'

export interface TraceBuffer {
  add(event: TraceEventRecord): void
  list(): TraceEventRecord[]
  clear(): void
}

export const createTraceBuffer = (limit = 500): TraceBuffer => {
  const events: TraceEventRecord[] = []

  return {
    add(event) {
      events.push(event)
      if (events.length > limit) events.splice(0, events.length - limit)
    },
    list() {
      return [...events]
    },
    clear() {
      events.length = 0
    },
  }
}
