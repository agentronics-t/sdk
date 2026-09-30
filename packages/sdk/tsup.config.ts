import { defineConfig } from 'tsup'
import { browserBundleWithIife } from '@agentronics/tsup-config'

export default defineConfig([
  browserBundleWithIife({
    entry: {
      index: 'src/index.ts',
      lite: 'src/lite.ts',
      'init-only': 'src/init-only.ts',
    },
  }),
  // Server entries: runtime-neutral (Node ≥ 20, edge, Workers). jose + next
  // stay external; next is an optional peer, only loaded by '/next'.
  {
    entry: { server: 'src/server/index.ts', next: 'src/server/next.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: false,
    treeshake: true,
    target: 'es2022',
    platform: 'neutral',
    external: ['jose', 'next', 'next/server', 'node:dns/promises'],
  },
])
