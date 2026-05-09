import { describe, expect, it } from 'vitest'
import { createPolicyEngine } from './engine.js'
import { installDomEnforcer } from './domEnforcer.js'

describe('dom enforcer', () => {
  it('blocks clicks for denied tool policies and shows an overlay', async () => {
    document.body.innerHTML = '<button data-agentronics-tool="cart.checkout">Checkout</button>'
    const engine = createPolicyEngine([
      {
        id: 'verified-checkout',
        tool: 'cart.checkout',
        minTrust: 'verified',
        allowedClasses: [],
        decision: 'allow',
      },
    ])
    const enforcer = installDomEnforcer({
      policyEngine: engine,
      getIdentity: () => null,
      documentRef: document,
    })
    const button = document.querySelector('button')!
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })

    button.dispatchEvent(event)
    await Promise.resolve()

    expect(event.defaultPrevented).toBe(true)
    expect(document.querySelector('[data-agentronics-deny-overlay="true"]')).not.toBeNull()
    enforcer.uninstall()
  })
})
