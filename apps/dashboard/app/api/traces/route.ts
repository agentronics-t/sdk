import { NextResponse, type NextRequest } from 'next/server'
import { gatewayFetch } from '../../../lib/gateway'

export const dynamic = 'force-dynamic'

const FORWARDED = ['limit', 'cursor', 'agentClass', 'type', 'since', 'until']

export const GET = async (req: NextRequest) => {
  const query: Record<string, string> = {}
  const params = req.nextUrl.searchParams
  for (const key of FORWARDED) {
    const value = params.get(key)
    if (value) query[key] = value
  }
  const upstream = await gatewayFetch('/v1/traces', { query })
  const body = await upstream.text()
  return new NextResponse(body, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
  })
}
