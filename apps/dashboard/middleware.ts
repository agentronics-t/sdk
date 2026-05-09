import { NextResponse, type NextRequest } from 'next/server'
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

const passthrough = (_req: NextRequest) => NextResponse.next()

const isClerkEnabled =
  Boolean(process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)

// Routes that must NOT trigger an auth redirect — the sign-in/up screens, the
// Next asset paths, and the API proxy (which carries its own session header).
const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/(.*)',
])

const guarded = clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return undefined
  const { userId } = await auth()
  if (!userId) {
    const url = req.nextUrl.clone()
    url.pathname = '/sign-in'
    url.searchParams.set('redirect_url', req.nextUrl.pathname)
    return NextResponse.redirect(url)
  }
  return undefined
})

export default isClerkEnabled ? guarded : passthrough

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)'],
}
