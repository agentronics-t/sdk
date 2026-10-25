import type { ReactNode } from 'react'
import { RootProvider } from 'fumadocs-ui/provider'
import { Funnel_Display, Funnel_Sans, Martian_Mono } from 'next/font/google'
import 'fumadocs-ui/style.css'
import './theme.css'

// Brand typography (same as agentronics.dev and the console): Funnel Display
// for headings, Funnel Sans for text, Martian Mono for code and labels.
const display = Funnel_Display({ subsets: ['latin'], variable: '--font-display', display: 'swap' })
const sans = Funnel_Sans({ subsets: ['latin'], variable: '--font-sans', display: 'swap' })
const mono = Martian_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' })

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
      className={`${display.variable} ${sans.variable} ${mono.variable}`}
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
