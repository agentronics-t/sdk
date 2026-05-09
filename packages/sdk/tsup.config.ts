import { defineConfig } from 'tsup'
import { browserBundleWithIife } from '@agentronics/tsup-config'

export default defineConfig(
  browserBundleWithIife({
    entry: {
      index: 'src/index.ts',
      lite: 'src/lite.ts',
      'init-only': 'src/init-only.ts',
    },
  })
)
