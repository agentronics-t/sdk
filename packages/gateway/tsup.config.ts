import { defineConfig } from 'tsup'
import { nodeBundle } from '@agentronics/tsup-config'

export default defineConfig(
  nodeBundle({
    entry: ['src/server.ts'],
    format: ['esm'],
    dts: false,
  })
)
