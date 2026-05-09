import 'server-only'
import { getSession, type DashboardSession } from './auth'

const DEFAULT_GATEWAY_URL = 'http://localhost:8787'

export const gatewayUrl = (): string =>
  process.env.GATEWAY_URL ?? DEFAULT_GATEWAY_URL

const buildHeaders = (session: DashboardSession, init?: HeadersInit): Headers => {
  const headers = new Headers(init)
  if (!headers.has('content-type')) headers.set('content-type', 'application/json')
  // The gateway's `resolveSession` validates this header. In production the
  // gateway is wired to the Clerk Backend SDK and validates a JWT instead;
  // both implementations land on the same `AuthContext`.
  headers.set('x-clerk-user', session.userId)
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
  const session = await getSession()
  const url = new URL(path.startsWith('http') ? path : `${gatewayUrl().replace(/\/$/, '')}${path}`)
  for (const [key, value] of Object.entries(init.query ?? {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value))
  }
  const fetchInit: RequestInit = {
    ...init,
    headers: buildHeaders(session, init.headers),
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
