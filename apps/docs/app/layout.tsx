import type { ReactNode } from 'react'
import { RootProvider } from 'fumadocs-ui/provider'
import { Space_Mono } from 'next/font/google'
import 'fumadocs-ui/style.css'
import './theme.css'

const spaceMono = Space_Mono({
  weight: ['400', '700'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-space-mono',
})

export const metadata = {
  title: 'Agentronics Docs',
  description: 'Universal governance layer for agent-surfable websites.',
  icons: { icon: '/logo.jpeg', shortcut: '/logo.jpeg', apple: '/logo.jpeg' },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`dark ${spaceMono.variable}`}>
      <body>
        {/* Dark-only by decision (see @agentronics/theme tokens + theme.css):
            force the dark theme and never let next-themes resolve to light. */}
        <RootProvider theme={{ defaultTheme: 'dark', enableSystem: false }}>
          {children}
        </RootProvider>
      </body>
    </html>
  )
}
