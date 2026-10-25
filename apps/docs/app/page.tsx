import { redirect } from 'next/navigation'

// The docs zone is served under agentronics.dev/docs; its own root just goes there.
export default function HomePage() {
  redirect('/docs')
}
