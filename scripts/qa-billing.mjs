// Read-only UI regression with synthetic, intercepted API responses only.
// QA_PLAYWRIGHT_PATH, QA_BROWSER_PATH, QA_BASE_URL and QA_OUTPUT_DIR are optional.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
const { chromium } = await import(process.env.QA_PLAYWRIGHT_PATH ? pathToFileURL(process.env.QA_PLAYWRIGHT_PATH).href : 'playwright')
const base = process.env.QA_BASE_URL || 'http://127.0.0.1:5176'
const output = process.env.QA_OUTPUT_DIR || path.resolve('qa-output/billing')
await fs.mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true, ...(process.env.QA_BROWSER_PATH ? { executablePath: process.env.QA_BROWSER_PATH } : {}) })
const bill = { id: 'qa-statement', account_number: 'QA-001', billing_period: 'September 2026', amount_due: 262, due_date: '2026-09-15', status: 'unpaid', previous_reading: 621, current_reading: 628, consumption: 7, source_updated_at: '2026-09-10T00:00:00Z', statement_details: { bill_number: 'QA-ONLY-001', registered_name: 'Sample Customer (QA ONLY)', service_address: 'Synthetic address for UI testing only', account_type: 'Residential', meter_number: 'QA-METER', meter_size: '1/2 inch', service_period: 'August–September 2026', reading_date: '2026-09-05', water_charge: 252, arrears: 0, other_charges: 0, meter_maintenance: 10, pay_immediately: 0, penalty: 25.2, amount_after_due: 287.2 } }
const legacy = { ...bill, id: 'qa-legacy', account_number: 'QA-002', billing_period: 'August 2026', due_date: '2026-08-15', status: 'paid', statement_details: null }
const accounts = ['QA-001', 'QA-002'].map((number, index) => ({ id: 'account-' + index, account_number: number, registered_name: 'QA ONLY', service_address: 'Synthetic service address' }))
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await context.addInitScript(() => {
    localStorage.setItem('mrwd_user', JSON.stringify({ id: 'qa-only-customer', role: 'customer', full_name: 'QA ONLY', email: 'qa@example.invalid' }))
    localStorage.setItem('mrwd_access_token', 'qa-intercepted-only')
  })
  let mode = 'bills'
  await context.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.pathname.includes('/api/')) {
      const data = url.pathname.endsWith('/billing') ? { bills: mode === 'empty' ? [] : [bill, legacy] } : url.pathname.endsWith('/service-accounts') ? { accounts, requests: [] } : { notifications: [], announcements: [], complaints: [], count: 0, unread_count: 0 }
      return route.fulfill({ status: mode === 'error' && url.pathname.endsWith('/billing') ? 503 : 200, json: mode === 'error' && url.pathname.endsWith('/billing') ? { error: 'Billing is temporarily unavailable. Please try again.' } : data })
    }
    if (url.origin !== base) return route.abort()
    return route.continue()
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error' && mode !== 'error') errors.push(message.text()) })
  await page.goto(base + '/customer/billing')
  await page.getByRole('heading', { name: 'Statement of account', exact: true }).waitFor({ timeout: 15000 }).catch(async error => { console.error({ url: page.url(), errors, body: await page.locator('body').innerText() }); throw error })
  assert.match(await page.locator('main').innerText(), /₱287.20/)
  for (const [width, theme] of [[1440, 'light'], [768, 'dark'], [390, 'light'], [390, 'dark']]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme }, theme)
    await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0) })
    await page.waitForTimeout(350)
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Page overflow at ' + width)
    await page.screenshot({ path: path.join(output, 'billing-' + width + '-' + theme + '.png'), fullPage: true })
    const button = page.getByRole('button', { name: 'View statement September 2026 for account QA-001', exact: true })
    await button.click()
    const dialog = page.getByRole('dialog', { name: 'Bill details', exact: true })
    await dialog.waitFor()
    assert.match(await dialog.innerText(), /QA-ONLY-001/)
    assert.ok(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'Dialog overflow')
    await page.screenshot({ path: path.join(output, 'statement-' + width + '-' + theme + '.png') })
    await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'hidden' })
    assert.ok(await button.evaluate(el => document.activeElement === el), 'Dialog must restore keyboard focus')
  }
  await page.getByRole('combobox', { name: /Service account/ }).selectOption('account-1')
  assert.equal(await page.getByRole('button', { name: /View statement September/ }).count(), 0)
  assert.match(await page.locator('main').innerText(), /Not provided/)
  assert.match(await page.locator('main').innerText(), /Paid · imported status/)
  const response = await page.request.get(base + '/templates/billing-statement.csv')
  assert.equal(response.status(), 200)
  assert.match(await response.text(), /amount_after_due/)
  mode = 'empty'
  await page.reload()
  await page.getByText('No bills available', { exact: true }).waitFor()
  mode = 'error'
  await page.reload()
  await page.getByText('Billing is temporarily unavailable. Please try again.', { exact: true }).waitFor()
  assert.deepEqual(errors, [])
  console.log('PASS: statement totals, legacy missing values, account filtering, paid status, empty/error states, template download, desktop/tablet/mobile light/dark, modal Escape/focus restoration; no page errors. Synthetic intercepted APIs only.')
} finally { await browser.close() }
