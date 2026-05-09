/** @typedef {import('tsup').Options} Options */

/**
 * @param {Partial<Options>} [overrides]
 * @returns {Options}
 */
export const browserBundle = (overrides = {}) => ({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: true,
  target: 'es2022',
  platform: 'browser',
  ...overrides,
})

/**
 * @param {Partial<Options>} [overrides]
 * @returns {Options}
 */
export const browserBundleWithIife = (overrides = {}) => ({
  ...browserBundle(),
  format: ['esm', 'cjs', 'iife'],
  globalName: 'Agentronics',
  ...overrides,
})

/**
 * @param {Partial<Options>} [overrides]
 * @returns {Options}
 */
export const nodeBundle = (overrides = {}) => ({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node20',
  platform: 'node',
  ...overrides,
})
