import 'server-only'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

export interface DashboardSession {
  userId: string
  email: string
  orgId: string
  orgName: string
}

export const isClerkConfigured = (): boolean =>
  Boolean(process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)

/**
 * Returns the active dashboard session, or null when the user is unauthenticated
 * or has no active organization. Pages that need a session should call
 * `requireSession()` instead -- it redirects unauthenticated traffic to
 * /sign-in and pre-org users to /onboarding so they can never render a
 * half-formed shell.
 *
 * In env-less local development (no Clerk keys), returns a stub session so the
 * `pnpm dev` shell renders without 500ing. The stub is *only* served when the
 * env vars are absent -- in production with keys present, no fallback is
 * possible and unauthenticated callers get redirected.
 */
export const getSession = async (): Promise<DashboardSession | null> => {
  if (!isClerkConfigured()) {
    return {
      userId: 'user_local_dev',
      email: 'dev@local.agentronics',
      orgId: 'org_local_dev',
      orgName: 'Local dev',
    }
  }
  const { userId, orgId, sessionClaims } = await auth()
  if (!userId || !orgId) return null
  return {
    userId,
    email: (sessionClaims?.['email'] as string | undefined) ?? `${userId}@clerk.agentronics`,
    orgId,
    orgName: (sessionClaims?.['org_name'] as string | undefined) ?? orgId,
  }
}

/**
 * Use inside server components / server actions for any route that requires
 * a real signed-in user *with* an active org. Bypasses the null check by
 * redirecting to the right place so the page itself never has to deal with
 * the half-state.
 */
export const requireSession = async (): Promise<DashboardSession> => {
  const session = await getSession()
  if (session) return session
  if (!isClerkConfigured()) throw new Error('requireSession called without Clerk configured')
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')
  redirect('/onboarding')
}
