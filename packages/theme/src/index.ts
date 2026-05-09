/**
 * @agentronics/theme — design tokens + font helpers shared by every
 * Agentronics surface. Values mirror `tokens.css`; expose them as a typed
 * object so server-rendered surfaces (gateway landing, future emails) can
 * inline the same hex values without hand-syncing two sources of truth.
 */

export const tokens = {
  accent: '#6366f1',
  accentStrong: '#818cf8',
  accentOn: '#07091a',

  highlight: '#f59e0b',
  highlightStrong: '#d97706',

  bg: '#07091a',
  bgElevated: '#0d1028',
  bgMuted: '#11152f',
  border: '#1f2547',
  borderStrong: '#2c3360',

  text: '#f4f4f5',
  textMuted: '#a4a8c5',
  textFaint: '#6b6f8e',

  danger: '#f87171',
  success: '#4ade80',
  warning: '#fbbf24',

  radius: 10,
  radiusLg: 14,
  fontFamily:
    "'Space Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
} as const

export type ThemeTokens = typeof tokens

export const SPACE_MONO_GOOGLE_FONT_URL =
  'https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap'
