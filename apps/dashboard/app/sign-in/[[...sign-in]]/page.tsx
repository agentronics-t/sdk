import { SignIn } from '@clerk/nextjs'
import { isClerkConfigured } from '../../../lib/auth'

export const dynamic = 'force-dynamic'

export default function SignInPage() {
  if (!isClerkConfigured()) {
    return (
      <main
        style={{
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          padding: '2rem',
          color: 'var(--text)',
        }}
      >
        <div
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '2rem',
            maxWidth: 480,
          }}
        >
          <h1 style={{ marginTop: 0, color: 'var(--highlight)' }}>Sign-in disabled</h1>
          <p style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>
            The dashboard is running in <strong>demo mode</strong>. Set
            <code> CLERK_SECRET_KEY</code> and <code>NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code> in
            your environment, then redeploy to enable Clerk-backed sign-in. Until then every
            visitor is auto-mapped to the demo org.
          </p>
        </div>
      </main>
    )
  }

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
      <SignIn
        path="/sign-in"
        routing="path"
        signUpUrl="/sign-up"
        fallbackRedirectUrl="/"
      />
    </main>
  )
}
