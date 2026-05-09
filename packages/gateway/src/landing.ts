/**
 * The browser-friendly landing page served at the gateway root. The gateway
 * is normally hit by the SDK / dashboard / cron jobs, but a human visiting
 * `https://gateway.agentronics.dev/` (or `localhost:8787/`) should still see
 * proof-of-life with the Agentronics palette and a pointer to the docs.
 *
 * The page is intentionally a self-contained HTML string (no asset pipeline,
 * no template engine). Token hex values are pulled from `@agentronics/theme`
 * so the palette stays in lockstep with the dashboard / docs / demo without
 * duplicating constants. Only the SVG favicon is inlined as a literal.
 */
import { tokens, SPACE_MONO_GOOGLE_FONT_URL } from '@agentronics/theme'

const t = tokens

export const GATEWAY_LANDING_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Agentronics Gateway</title>
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><circle cx='32' cy='32' r='30' fill='%231f1740'/><rect x='20' y='18' width='24' height='28' rx='2' fill='%236366f1'/><rect x='26' y='34' width='12' height='12' fill='%23818cf8'/></svg>" />
    <style>
      @import url('${SPACE_MONO_GOOGLE_FONT_URL}');
      :root {
        --accent: ${t.accent};
        --accent-strong: ${t.accentStrong};
        --highlight: ${t.highlight};
        --bg: ${t.bg};
        --bg-elevated: ${t.bgElevated};
        --bg-muted: ${t.bgMuted};
        --border: ${t.border};
        --text: ${t.text};
        --text-muted: ${t.textMuted};
        --font: ${t.fontFamily};
      }
      * { box-sizing: border-box; }
      html, body {
        margin: 0;
        padding: 0;
        background: var(--bg);
        color: var(--text);
        font-family: var(--font);
        min-height: 100vh;
      }
      main {
        max-width: 760px;
        margin: 0 auto;
        padding: 4rem 1.5rem;
      }
      .brand {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 2rem;
        font-weight: 700;
        letter-spacing: 0.06em;
        color: var(--highlight);
      }
      .brand-mark {
        width: 36px;
        height: 36px;
        border-radius: 8px;
        background: radial-gradient(circle at 50% 35%, #2a235e 0%, #1f1740 80%);
        display: grid;
        place-items: center;
      }
      .brand-mark span {
        width: 16px;
        height: 18px;
        background: var(--accent);
        border-radius: 2px;
      }
      .eyebrow {
        display: inline-block;
        font-size: 0.78rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--highlight);
        background: rgba(245, 158, 11, 0.12);
        padding: 0.3rem 0.7rem;
        border-radius: 999px;
        border: 1px solid rgba(245, 158, 11, 0.3);
      }
      h1 {
        font-size: clamp(1.6rem, 3vw, 2.2rem);
        margin: 1rem 0;
        line-height: 1.2;
      }
      p { color: var(--text-muted); line-height: 1.7; }
      .panel {
        margin-top: 2rem;
        padding: 1rem 1.25rem;
        background: var(--bg-elevated);
        border: 1px solid var(--border);
        border-radius: 10px;
      }
      .panel h3 {
        margin: 0 0 0.5rem;
        font-size: 0.85rem;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--accent-strong);
      }
      .panel ul {
        margin: 0;
        padding: 0;
        list-style: none;
        display: grid;
        gap: 6px;
      }
      .panel code {
        color: var(--highlight);
      }
      a {
        color: var(--accent-strong);
        text-decoration: none;
      }
      a:hover { text-decoration: underline; }
    </style>
  </head>
  <body>
    <main>
      <div class="brand">
        <div class="brand-mark"><span></span></div>
        <span>AGENTRONICS · GATEWAY</span>
      </div>
      <span class="eyebrow">v0.1.0 · alive</span>
      <h1>Agentronics control plane.</h1>
      <p>
        You're looking at the gateway service that backs the Agentronics SDK. It stores policies, site memory, traces, and API keys for every site that ships
        <code style="color: var(--highlight)">@agentronics/sdk</code>. Humans usually visit the
        <a href="https://docs.agentronics.dev">docs</a> or
        <a href="https://dashboard.agentronics.dev">dashboard</a> instead.
      </p>
      <div class="panel">
        <h3>Public endpoints</h3>
        <ul>
          <li><code>GET /v1/health</code> — uptime + database status</li>
          <li><code>GET /v1/sites/:id/.well-known/agent-context.json</code> — site memory for any agent</li>
          <li><code>GET /v1/policies</code> · <code>GET /v1/memory</code> · <code>GET /v1/traces</code> — authenticated</li>
          <li><code>POST /v1/api-keys</code> · <code>GET /v1/metrics</code> — Clerk session required</li>
        </ul>
      </div>
      <div class="panel">
        <h3>Get started</h3>
        <p>
          npm install <code>@agentronics/sdk</code>, then read the
          <a href="https://docs.agentronics.dev/docs/getting-started">getting-started</a> guide.
        </p>
      </div>
    </main>
  </body>
</html>`
