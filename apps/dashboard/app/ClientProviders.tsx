'use client'

import type { ReactNode } from 'react'
import { ClerkProvider } from '@clerk/nextjs'

export const ClientProviders = ({
  children,
  clerkEnabled,
}: {
  children: ReactNode
  clerkEnabled: boolean
}) => {
  if (!clerkEnabled) return <>{children}</>
  return <ClerkProvider>{children}</ClerkProvider>
}
