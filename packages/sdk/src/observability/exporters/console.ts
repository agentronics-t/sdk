import type { TraceEvent as TraceEventRecord } from '@agentronics/protocol'
import type { TraceExporter } from '../tracer.js'

export const createConsoleExporter = (): TraceExporter => ({
  name: 'console',
  export(events: TraceEventRecord[]) {
    for (const event of events) {
      console.info('[agentronics:trace]', event.type, event)
    }
  },
})
