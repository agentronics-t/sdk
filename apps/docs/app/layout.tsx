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
    <html lang="en" suppressHydrationWarning className={spaceMono.variable}>
      <body>
        {/* Light + dark both ship (see theme.css). next-themes resolves the
            class; the toggle lives in the docs sidebar. Dark stays default. */}
        <RootProvider theme={{ defaultTheme: 'dark', enableSystem: true }}>
          {children}
        </RootProvider>
      </body>
    </html>
  )
}
