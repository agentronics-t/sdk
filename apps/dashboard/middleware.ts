import { NextResponse, type NextRequest } from 'next/server'
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

const isClerkEnabled =
  Boolean(process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)

// Routes that don't need a session -- the auth screens themselves and the
// dashboard's own API proxy (which carries its own headers).
const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/(.*)',
])

const isOnboardingRoute = createRouteMatcher(['/onboarding(.*)'])

const withPathname = (req: NextRequest, response = NextResponse.next()): NextResponse => {
  // Surface the request pathname to server components so the layout can decide
  // whether to render the full dashboard chrome or a minimal auth shell.
  response.headers.set('x-pathname', req.nextUrl.pathname)
  return response
}

const passthrough = (req: NextRequest) => withPathname(req)

const guarded = clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return withPathname(req)

  const { userId, orgId } = await auth()
  if (!userId) {
    const url = req.nextUrl.clone()
    url.pathname = '/sign-in'
    url.searchParams.set('redirect_url', req.nextUrl.pathname)
    return NextResponse.redirect(url)
  }

  // Force org creation on first sign-in. Anyone without an active org gets
  // bounced to /onboarding and stays there until they create one.
  if (!orgId && !isOnboardingRoute(req)) {
    const url = req.nextUrl.clone()
    url.pathname = '/onboarding'
    return NextResponse.redirect(url)
  }
  // Already has an org -- /onboarding is a dead end, send them home.
  if (orgId && isOnboardingRoute(req)) {
    const url = req.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return withPathname(req)
})

export default isClerkEnabled ? guarded : passthrough

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)'],
}
