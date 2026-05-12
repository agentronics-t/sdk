import 'server-only'
import { auth } from '@clerk/nextjs/server'

const DEFAULT_GATEWAY_URL = 'https://gateway.agentronics.dev'

/**
 * Server-side gateway URL. `GATEWAY_URL` is the canonical env var used by all
 * server components and route handlers; in dev, set it to your local gateway
 * (e.g. `http://localhost:8787`). `NEXT_PUBLIC_GATEWAY_URL` is its
 * browser-side mirror used by client components like the API key issuer.
 */
export const gatewayUrl = (): string => process.env.GATEWAY_URL ?? DEFAULT_GATEWAY_URL

const buildHeaders = async (init?: HeadersInit): Promise<Headers> => {
  const headers = new Headers(init)
  if (!headers.has('content-type')) headers.set('content-type', 'application/json')

  // Production: attach a real Clerk session token. The gateway verifies it
  // via @clerk/backend's verifyToken() (see packages/gateway/src/vercel-handler.js)
  // and reads userId + active orgId off the JWT claims.
  // In env-less dev, fall back to the stub headers the local server.ts trusts
  // when SEED_FIXTURE=true is set.
  const isClerkConfigured = Boolean(
    process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  )

  if (isClerkConfigured) {
    const { getToken } = await auth()
    const token = await getToken()
    if (token) headers.set('authorization', `Bearer ${token}`)
  } else {
    // Local-dev fallback used by `pnpm dev` against a SEED_FIXTURE gateway.
    headers.set('x-clerk-user', 'user_local_dev')
  }

  return headers
}

export interface GatewayRequestInit extends Omit<RequestInit, 'headers'> {
  headers?: HeadersInit
  query?: Record<string, string | number | undefined>
}

export const gatewayFetch = async (
  path: string,
  init: GatewayRequestInit = {}
): Promise<Response> => {
  const url = new URL(path.startsWith('http') ? path : `${gatewayUrl().replace(/\/$/, '')}${path}`)
  for (const [key, value] of Object.entries(init.query ?? {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value))
  }
  const fetchInit: RequestInit = {
    ...init,
    headers: await buildHeaders(init.headers),
    cache: 'no-store',
  }
  return fetch(url, fetchInit)
}

export const gatewayJson = async <T>(
  path: string,
  init: GatewayRequestInit = {}
): Promise<T> => {
  const response = await gatewayFetch(path, init)
  if (!response.ok) {
    throw new Error(`gateway ${response.status} on ${path}`)
  }
  return (await response.json()) as T
}
