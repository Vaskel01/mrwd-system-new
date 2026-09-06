// Read-only live workspace smoke checks + explicitly mocked detail-form faults.
// Set QA_DEMO_PASSWORD, QA_PLAYWRIGHT_PATH (optional installed module path),
// QA_BROWSER_PATH (optional Chrome executable), QA_BASE_URL, QA_OUTPUT_DIR.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
const { chromium } = await import(process.env.QA_PLAYWRIGHT_PATH ? pathToFileURL(process.env.QA_PLAYWRIGHT_PATH).href : 'playwright')
const base = process.env.QA_BASE_URL || 'http://localhost:5175'
const password = process.env.QA_DEMO_PASSWORD
if (!password) throw new Error('Set QA_DEMO_PASSWORD; credentials are never saved in the report.')
const output = process.env.QA_OUTPUT_DIR || path.resolve('qa-output')
await fs.mkdir(output, { recursive: true })
const results = []
const browser = await chromium.launch({ headless: true, ...(process.env.QA_BROWSER_PATH ? { executablePath: process.env.QA_BROWSER_PATH } : {}) })
const roles = [
  ['customer', 'customer@demo.com', ['/customer/my-complaints', '/customer/submit', '/customer/billing', '/notifications']],
  ['commercial', 'commercial1@mrwd.test', ['/commercial/dashboard', '/commercial/complaints', '/commercial/reports', '/commercial/accounts-billing']],
  ['ecmd', 'ecmd1@mrwd.test', ['/ecmd/dashboard', '/ecmd/dispatch', '/ecmd/field-operations']],
  ['maintenance', 'maintenance@demo.com', ['/maintenance/tasks', '/notifications', '/profile']],
]
try {
  for (const [role, email, routes] of roles) {
    if (process.env.QA_ROLE && process.env.QA_ROLE !== role) continue
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await context.newPage()
    const errors = []
    const consoleErrors = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })
    try {
      await page.goto(`${base}/login`)
      await page.getByLabel('Email').fill(email)
      await page.locator('#login-password').fill(password)
      await page.getByRole('button', { name: 'Sign in', exact: true }).click()
      await page.waitForURL(url => !url.pathname.endsWith('/login'), { timeout: 30000 })
      assert.notEqual(new URL(page.url()).pathname, '/mfa', 'MFA requires the account holder; do not bypass it')
      for (const route of routes) {
        await page.goto(`${base}${route}`)
        await page.waitForLoadState('networkidle')
        assert.equal(new URL(page.url()).pathname, route, `Unexpected redirect from ${route}`)
        assert.ok((await page.locator('main').innerText()).trim().length > 30, 'Page is blank')
        assert.equal(await page.locator('vite-error-overlay').count(), 0)
        for (const [theme, width] of [['light', 1440], ['dark', 768], ['dark', 390]]) {
          await page.evaluate(theme => { localStorage.setItem('mrwd-color-theme', theme); document.documentElement.dataset.theme = theme }, theme)
          await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
          if (width < 1024) await page.waitForFunction(() => {
            const nav = document.getElementById('primary-navigation')
            return !nav || nav.getBoundingClientRect().right <= 0
          })
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${route} overflows at ${width}`)
          await page.screenshot({ path: path.join(output, `${role}-${route.split('/').pop()}-${width}-${theme}.png`), fullPage: true })
        }
        results.push({ check: `${role} ${route}: desktop/light, tablet/dark, mobile/dark`, status: 'PASS' })
        await page.setViewportSize({ width: 1440, height: 1000 })
      }
      await page.getByRole('button', { name: 'Open quick find', exact: true }).filter({ visible: true }).click()
      const search = page.getByRole('dialog', { name: 'Quick Find' }).locator('input')
      await search.fill('water')
      await search.press('Space')
      await search.pressSequentially('issue')
      assert.equal(await search.inputValue(), 'water issue')
      assert.ok(await search.evaluate(el => document.activeElement === el))
      await search.press('Escape')
      await page.getByRole('dialog', { name: 'Quick Find' }).waitFor({ state: 'hidden' })
      results.push({ check: `${role}: quick find typing, spaces and Escape`, status: 'PASS' })
      if (role === 'maintenance') {
        // A fake detail exists only inside this browser's intercepted responses.
        const id = '00000000-0000-4000-8000-000000000099'
        const userId = await page.evaluate(() => JSON.parse(localStorage.getItem('mrwd_user')).id)
        const complaint = { id, complaint_type: 'Water Leak', description: 'QA ONLY: form regression fixture; not stored', address: 'QA ONLY location', status: 'in_progress', priority: 'medium', assigned_to: userId, customer_id: 'qa-customer', reference_number: 'QA-UI-ONLY', created_at: new Date().toISOString(), photo_urls: [] }
        await page.route(`**/api/**${id}**`, async route => {
          const request = route.request()
          if (request.method() !== 'GET') return route.fulfill({ status: 503, json: { error: 'QA simulated outage; nothing submitted.' } })
          return route.fulfill({ json: request.url().endsWith(`/complaints/${id}`) ? { complaint } : { updates: [], feedback: null, follow_ups: [], assignments: [], resources: [], inventory: [], manpower: [], usage: [], notes: [], contacts: [], related: [] } })
        })
        await page.goto(`${base}/complaints/${id}`)
        await page.getByRole('heading', { name: 'Field work actions' }).waitFor()
        await page.getByRole('button', { name: 'Mark field work complete' }).first().click()
        const dialog = page.getByRole('dialog', { name: 'Complete and resolve complaint' })
        const notes = dialog.locator('textarea').first()
        await notes.fill('QA repaired')
        await notes.press('Space')
        await notes.pressSequentially('water line')
        assert.equal(await notes.inputValue(), 'QA repaired water line')
        assert.ok(await notes.evaluate(el => document.activeElement === el))
        assert.equal(await dialog.locator('input[type=file]').getAttribute('required'), '')
        // Fail Storage locally: no actual photo is uploaded and no completion submitted.
        await page.route('**/storage/v1/object/complaint-photos/**', route => route.fulfill({ status: 503, json: { error: 'QA upload unavailable', message: 'QA upload unavailable' } }))
        await dialog.locator('input[type=file]').setInputFiles({ name: 'QA-proof.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=', 'base64') })
        await dialog.getByRole('button', { name: 'Complete and resolve', exact: true }).click()
        await page.getByRole('alert').first().waitFor()
        assert.ok((await page.getByRole('alert').first().innerText()).length > 0)
        assert.ok(await dialog.isVisible(), 'Upload failure must leave form open')
        assert.equal(await notes.inputValue(), 'QA repaired water line')
        await page.setViewportSize({ width: 390, height: 844 })
        await page.screenshot({ path: path.join(output, 'maintenance-upload-failure-mobile.png'), fullPage: true })
        await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
        await page.getByRole('button', { name: 'Mark field work complete' }).first().click()
        assert.equal(await notes.inputValue(), 'QA repaired water line', 'Completion draft retained on reopen')
        await notes.press('Escape')
        results.push({ check: 'Maintenance completion: typing/space focus, required photo, upload-failure recovery, draft retention (mocked fixture)', status: 'PASS' })
      }
      assert.deepEqual(errors, [])
      results.push({ check: `${role}: no browser exceptions`, status: 'PASS' })
    } catch (error) {
      results.push({ check: role, status: 'FAIL', error: error.message, browserErrors: errors, consoleErrors })
      await page.screenshot({ path: path.join(output, `${role}-failure.png`), fullPage: true }).catch(() => {})
    } finally { await context.close() }
    console.log(`${role}: ${results.at(-1).status}`)
  }
} finally {
  await browser.close()
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ date: new Date().toISOString(), base, results }, null, 2))
}
console.log(JSON.stringify(results, null, 2))
if (results.some(result => result.status === 'FAIL')) process.exitCode = 1
