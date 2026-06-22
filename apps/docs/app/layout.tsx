import type { ReactNode } from 'react'
import { RootProvider } from 'fumadocs-ui/provider'
import { DM_Sans, JetBrains_Mono } from 'next/font/google'
import 'fumadocs-ui/style.css'
import './theme.css'

// Brand typography (matches the marketing site + dashboard): DM Sans for UI/body,
// JetBrains Mono for code. Exposed as --font-sans / --font-mono, consumed by
// theme.css and @agentronics/theme tokens.
const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-mono',
  display: 'swap',
})

export const metadata = {
  title: 'Agentronics Docs',
  description: 'Universal governance layer for agent-surfable websites.',
  icons: {
    icon: '/docs-static/logo.jpeg',
    shortcut: '/docs-static/logo.jpeg',
    apple: '/docs-static/logo.jpeg',
  },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${dmSans.variable} ${jetbrainsMono.variable}`}
    >
      <body>
        {/* Light by default with a working theme switcher, matching the brand
            palette (@agentronics/theme tokens + theme.css). next-themes manages
            the `.dark` class; Fumadocs' RootProvider handles the no-flash script. */}
        <RootProvider theme={{ defaultTheme: 'light', enableSystem: true }}>
          {children}
        </RootProvider>
      </body>
    </html>
  )
}
