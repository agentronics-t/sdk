import { Card } from '../ui/Card'
import { LiveFeed } from './LiveFeed'

export default function LivePage() {
  return (
    <section style={{ display: 'grid', gap: 16 }}>
      <header>
        <h1 style={{ margin: 0 }}>Live</h1>
        <p style={{ color: 'var(--text-muted)', marginTop: 4 }}>
          Polling the gateway every 2s. Drop a publishable key into the demo and trigger a tool —
          you should see a row appear within one tick.
        </p>
      </header>
      <Card title="Most recent events">
        <LiveFeed />
      </Card>
    </section>
  )
}
