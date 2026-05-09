import { expect, test } from '@playwright/test'

const DASHBOARD_URL = 'http://localhost:4301'

test('dashboard /live shows a trace from the demo within 5 seconds', async ({ page, context }) => {
  // Step 1: open the demo, generate at least one trace by setting cart memory.
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Agentronics Demo' })).toBeVisible()
  await page.getByRole('button', { name: 'Set cart memory' }).click()

  // Give the gateway exporter a tick to ship the batch upstream.
  await page.waitForTimeout(500)

  // Step 2: open the dashboard live feed in a separate page. Polling is 2s
  // so the assertion budget is comfortably under the plan's 5s SLA.
  const dashboard = await context.newPage()
  await dashboard.goto(`${DASHBOARD_URL}/live`)
  await expect(dashboard.getByRole('heading', { name: 'Live' })).toBeVisible()

  // The feed renders empty rows initially; assert we see at least one
  // memory.updated row land within 5 seconds.
  await expect(dashboard.getByRole('cell', { name: 'memory.updated' }).first()).toBeVisible({
    timeout: 5_000,
  })
})
