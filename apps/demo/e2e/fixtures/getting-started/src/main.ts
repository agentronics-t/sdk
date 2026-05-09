// Pasted directly from docs/getting-started.mdx — must build untouched.
import { Agentronics } from '@agentronics/sdk'

const agentronics = Agentronics.init({
  siteId: 'getting-started-fixture',
  publishableKey: 'agtx_pk_paste_test_local_only',
})

if (typeof window !== 'undefined') {
  ;(window as unknown as { __agentronics: typeof agentronics }).__agentronics = agentronics
}
