import { z } from 'zod'

const LOCAL_DEV_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  // Vite's default dev server — what an SDK consumer's app boots on when
  // they run `pnpm dev` in their own project against a local gateway.
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
]

const PRODUCTION_DEFAULT_ORIGINS = [
  'https://dashboard.agentronics.dev',
  'https://demo.agentronics.dev',
  'https://docs.agentronics.dev',
]

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8787),
  DATABASE_URL: z.string().url().optional(),
  // Empty string is allowed — distinguishes "operator set this on purpose,
  // they want to lock down all browser callers" from "operator forgot,
  // please apply the sensible default for the current NODE_ENV".
  ALLOWED_ORIGINS: z.string().optional(),
  // Required for /v1/cron/* endpoints. Min length matches the random-token
  // strength operators typically generate (>= 128 bits of entropy).
  CRON_SECRET: z.string().min(16).optional(),
  // Comma-separated list of proxy IPs/CIDRs that the gateway sits behind.
  // When set, x-forwarded-for / x-real-ip are honoured for rate-limit
  // keying; when unset, those headers are ignored and the rate limiter
  // falls back to the API key id or 'anonymous'. Prevents header-spoof
  // bypass on internet-facing deployments.
  TRUSTED_PROXY_IPS: z.string().optional(),
  SEED_FIXTURE: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((value) => value === 'true'),
})

type RawEnv = z.infer<typeof Env>
export type Env = Omit<RawEnv, 'ALLOWED_ORIGINS' | 'TRUSTED_PROXY_IPS'> & {
  ALLOWED_ORIGINS: string[]
  TRUSTED_PROXY_IPS: string[]
}

const splitOrigins = (raw: string): string[] =>
  raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

const resolveAllowedOrigins = (raw: string | undefined, nodeEnv: RawEnv['NODE_ENV']): string[] => {
  // `undefined` = operator never set the var → apply environment default.
  if (raw === undefined) {
    return nodeEnv === 'production' ? PRODUCTION_DEFAULT_ORIGINS : LOCAL_DEV_ORIGINS
  }
  // Non-empty value = honour exactly what was set, regardless of NODE_ENV.
  const parsed = splitOrigins(raw)
  if (parsed.length > 0) return parsed
  // Empty string = operator deliberately wants no browser callers (e.g.
  // gateway behind a reverse proxy that strips Origin). Honour the intent.
  return []
}

export const loadEnv = (source: NodeJS.ProcessEnv = process.env): Env => {
  const parsed = Env.safeParse(source)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n')
    throw new Error(`Invalid gateway environment:\n${issues}`)
  }
  return {
    ...parsed.data,
    ALLOWED_ORIGINS: resolveAllowedOrigins(parsed.data.ALLOWED_ORIGINS, parsed.data.NODE_ENV),
    TRUSTED_PROXY_IPS: splitOrigins(parsed.data.TRUSTED_PROXY_IPS ?? ''),
  }
}
