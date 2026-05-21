'use client'

import { useEffect, useState } from 'react'

/* Light/dark toggle for the dashboard top bar. Self-contained: it flips the
 * `html.light` class and persists the choice — no context provider, since the
 * server-rendered chrome reads the theme purely through CSS variables. The
 * pre-hydration script in layout.tsx applies the stored choice with no flash. */

const STORAGE_KEY = 'agentronics:theme'

const Sun = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
  </svg>
)

const Moon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
)

export const ThemeToggle = () => {
  const [light, setLight] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    setLight(document.documentElement.classList.contains('light'))
  }, [])

  const toggle = () => {
    const next = !light
    const root = document.documentElement
    root.classList.add('theme-transition')
    root.classList.toggle('light', next)
    try {
      localStorage.setItem(STORAGE_KEY, next ? 'light' : 'dark')
    } catch {
      /* private mode — choice just won't persist */
    }
    setLight(next)
    window.setTimeout(() => root.classList.remove('theme-transition'), 200)
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="icon-btn"
      aria-label={light ? 'Switch to dark theme' : 'Switch to light theme'}
    >
      {mounted && light ? <Moon /> : <Sun />}
    </button>
  )
}
