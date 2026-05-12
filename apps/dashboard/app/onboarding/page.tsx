'use client'

import { CreateOrganization } from '@clerk/nextjs'

export default function OnboardingPage() {
  return (
    <div
      style={{
        minHeight: 'calc(100vh - 1px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        background: 'var(--bg)',
      }}
    >
      <div style={{ maxWidth: 520, width: '100%' }}>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 700,
            marginBottom: 8,
            color: 'var(--text)',
          }}
        >
          Create your organization
        </h1>
        <p
          style={{
            color: 'var(--text-muted)',
            marginBottom: 24,
            fontSize: 14,
            lineHeight: 1.5,
          }}
        >
          Agentronics groups your sites, API keys, traces, and policies under
          an organization. You can invite teammates later from Settings.
        </p>
        <CreateOrganization
          afterCreateOrganizationUrl="/"
          skipInvitationScreen
          appearance={{
            elements: {
              rootBox: { width: '100%' },
              card: {
                boxShadow: 'none',
                border: '1px solid var(--border)',
                background: 'var(--bg-elevated)',
              },
            },
          }}
        />
      </div>
    </div>
  )
}
