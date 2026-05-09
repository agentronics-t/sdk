import type { Options } from 'tsup'

export declare const browserBundle: (overrides?: Partial<Options>) => Options
export declare const browserBundleWithIife: (overrides?: Partial<Options>) => Options
export declare const nodeBundle: (overrides?: Partial<Options>) => Options
