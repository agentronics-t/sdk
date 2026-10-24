import type { ReactNode } from 'react'
import { RootProvider } from 'fumadocs-ui/provider'
import { Inter, JetBrains_Mono, Space_Grotesk } from 'next/font/google'
import 'fumadocs-ui/style.css'
import './theme.css'

// Brand typography (same as agentronics.dev and the console): Space Grotesk for
// headings, Inter for body, JetBrains Mono for code.
const display = Space_Grotesk({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-display', display: 'swap' })
const inter = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' })
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--font-mono', display: 'swap' })

export const metadata = {
  title: 'Agentronics Docs',
  description: 'Make your website ready for AI agents: the Agentronics SDK for WebMCP tools, agent detection, auth, rules and observability.',
  icons: {
    icon: '/docs-static/icon.svg',
    shortcut: '/docs-static/icon.svg',
    apple: '/docs-static/icon.svg',
  },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${display.variable} ${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body>
        {/* Light by default with a working theme switcher, matching the brand
            palette (@agentronics/theme tokens + theme.css). next-themes manages
            the `.dark` class; Fumadocs' RootProvider handles the no-flash script. */}
        {/* Search endpoint lives under /docs so the marketing-site multi-zone
            rewrite proxies it (see app/docs/api/search/route.ts). */}
        <RootProvider
          theme={{ defaultTheme: 'light', enableSystem: true }}
          search={{ options: { api: '/docs/api/search' } }}
        >
          {children}
        </RootProvider>
      </body>
    </html>
  )
}
