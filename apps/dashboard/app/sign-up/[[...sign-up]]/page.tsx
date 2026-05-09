import { SignUp } from '@clerk/nextjs'
import { isClerkConfigured } from '../../../lib/auth'

export const dynamic = 'force-dynamic'

export default function SignUpPage() {
  if (!isClerkConfigured()) return null
  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        padding: '2rem',
        background: 'var(--bg)',
      }}
    >
      <SignUp path="/sign-up" routing="path" signInUrl="/sign-in" fallbackRedirectUrl="/" />
    </main>
  )
}
