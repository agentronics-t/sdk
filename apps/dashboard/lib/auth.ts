import 'server-only'
import { auth } from '@clerk/nextjs/server'

export interface DashboardSession {
  userId: string
  email: string
  orgId: string
  orgName: string
  /** True when running without Clerk credentials — pages should render a banner. */
  demoMode: boolean
}

const STUB_SESSION: DashboardSession = {
  userId: 'user_demo',
  email: 'demo@agentronics.dev',
  orgId: 'org_demo',
  orgName: 'Demo Org',
  demoMode: true,
}

export const isClerkConfigured = (): boolean =>
  Boolean(process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)

/**
 * Resolve the active dashboard session. Falls back to the demo stub when
 * Clerk credentials are absent — keeps `pnpm dev` / `pnpm build` working in
 * envs without the real keys (CI, local, preview deploys).
 */
export const getSession = async (): Promise<DashboardSession> => {
  if (!isClerkConfigured()) return STUB_SESSION
  const { userId, orgId, sessionClaims } = await auth()
  if (!userId || !orgId) return { ...STUB_SESSION, demoMode: true }
  return {
    userId,
    email: (sessionClaims?.['email'] as string | undefined) ?? `${userId}@clerk.agentronics`,
    orgId,
    orgName: (sessionClaims?.['org_name'] as string | undefined) ?? orgId,
    demoMode: false,
  }
}
