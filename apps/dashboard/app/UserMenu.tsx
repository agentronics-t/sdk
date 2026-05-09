'use client'

import { UserButton } from '@clerk/nextjs'

/**
 * Topbar avatar + sign-out menu, only mounted in real Clerk mode. Demo mode
 * gets the "demo mode" pill instead.
 */
export const UserMenu = () => (
  <UserButton
    appearance={{
      elements: {
        avatarBox: { width: 28, height: 28 },
      },
    }}
  />
)
