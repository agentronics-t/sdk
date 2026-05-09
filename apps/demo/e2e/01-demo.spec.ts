import { expect, test } from '@playwright/test'

test.describe('demo', () => {
  test('boots — header renders, init log fires, trace panel mounts', async ({ page }) => {
    const consoleMessages: string[] = []
    page.on('console', (msg) => consoleMessages.push(`${msg.type()}:${msg.text()}`))

    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Agentronics Demo' })).toBeVisible()
    await expect(page.getByTestId('trace-stream')).toBeVisible()

    await expect
      .poll(() => consoleMessages.some((line) => line.includes('Agentronics initialized')))
      .toBe(true)
  })

  test('tool register + execute writes a trace into the live panel', async ({ page }) => {
    await page.goto('/')

    // The "Set cart memory" button calls into the Memory store, which emits
    // memory.updated traces via the SDK's tracer — proving registration +
    // execution end-to-end without depending on a real WebMCP runtime.
    const before = await page.getByTestId('trace-stream').textContent()
    await page.getByRole('button', { name: 'Set cart memory' }).click()

    await expect
      .poll(async () => {
        const text = (await page.getByTestId('trace-stream').textContent()) ?? ''
        return text !== before && text.includes('memory.updated')
      })
      .toBe(true)
  })

  test('deny overlay fires when a declared agent attempts cart.checkout', async ({ page }) => {
    await page.goto('/')

    // Step 1: declare a screenshot agent — trust = declared. The seeded
    // policy `verified-only-checkout` requires `verified` trust on
    // cart.checkout, so the click should be blocked.
    await page.getByRole('button', { name: 'Declare screenshot agent' }).click()

    // Step 2: click the cart.checkout button. The DOM enforcer is wired in
    // the demo via `installDomEnforcer()` — it listens on
    // [data-agentronics-tool] and calls preventDefault() on deny.
    await page.locator('button[data-agentronics-tool="cart.checkout"]').click()

    await expect(page.locator('[data-agentronics-deny-overlay]')).toBeVisible()
  })
})
