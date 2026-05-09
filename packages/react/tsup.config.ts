import { defineConfig } from 'tsup'
import { browserBundle } from '@agentronics/tsup-config'

export default defineConfig(
  browserBundle({
    external: ['react', '@agentronics/sdk', '@agentronics/protocol'],
  })
)
