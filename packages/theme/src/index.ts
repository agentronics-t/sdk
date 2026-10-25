/**
 * @agentronics/theme — design tokens + font helpers shared by every
 * Agentronics surface. Values mirror `tokens.css`; expose them as a typed
 * object so server-rendered surfaces (gateway landing, future emails) can
 * inline the same hex values without hand-syncing two sources of truth.
 */

export const tokens = {
  accent: '#d4ff3a',
  accentStrong: '#e4ff7a',
  accentOn: '#0b0b0c',

  highlight: '#ff4d1f',
  highlightStrong: '#e0401a',

  bg: '#0b0b0c',
  bgElevated: '#161618',
  bgMuted: '#222225',
  border: '#2c2c2e',
  borderStrong: '#4a4a4e',

  text: '#ffffff',
  textMuted: '#b5b5b8',
  textFaint: '#8a8a8e',

  danger: '#ff6a42',
  success: '#d4ff3a',
  warning: '#ffb224',

  radius: 10,
  radiusLg: 14,
  fontFamily: "'Funnel Sans', 'Helvetica Neue', Arial, sans-serif",
  fontDisplay: "'Funnel Display', 'Helvetica Neue', Arial, sans-serif",
  fontMono: "'Martian Mono', ui-monospace, 'SF Mono', Menlo, monospace",
} as const

export type ThemeTokens = typeof tokens

/** The design system's three fonts: Funnel Display, Funnel Sans, Martian Mono. */
export const FONT_URL =
  'https://fonts.googleapis.com/css2?family=Funnel+Display:wght@300..800&family=Funnel+Sans:wght@300..800&family=Martian+Mono:wdth,wght@75..112.5,300..700&display=swap'

/** @deprecated The brand no longer uses Space Mono; this is FONT_URL. */
export const SPACE_MONO_GOOGLE_FONT_URL = FONT_URL
