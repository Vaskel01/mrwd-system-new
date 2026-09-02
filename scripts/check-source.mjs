import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { getPageHelp } from '../src/config/pageHelp.js'

const root = process.cwd()
const failures = []
const skipDirs = new Set(['.git', 'node_modules', 'dist', 'coverage', '.vercel'])

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (entry.isDirectory() && skipDirs.has(entry.name)) return []
    const full = path.join(dir, entry.name)
    return entry.isDirectory() ? walk(full) : [full]
  })
}

const files = walk(root)
const rel = file => path.relative(root, file).replaceAll(path.sep, '/')
const textFiles = files.filter(file => !/\.(png|jpe?g|gif|webp|ico|xlsx|zip|pdf)$/i.test(file))

const forbiddenFiles = files
  .map(rel)
  .filter(name => /(^|\/)\.env(?:\.|$)/.test(name) && !name.endsWith('.env.example') && !name.endsWith('/.env.example'))
if (forbiddenFiles.length) failures.push(`Local environment files are present: ${forbiddenFiles.join(', ')}`)

if (fs.existsSync(path.join(root, 'src/pages/admin'))) failures.push('Legacy src/pages/admin directory must not be shipped.')

const appPath = path.join(root, 'src/App.jsx')
if (fs.existsSync(appPath)) {
  const appSource = fs.readFileSync(appPath, 'utf8')
  const routedPages = [...appSource.matchAll(/<Route path="([^"]+)"/g)]
    .map(match => match[1])
    .filter(routePath => routePath !== '/' && routePath !== '*' && !routePath.startsWith('/admin/'))
    .map(routePath => routePath.replace(/:[^/]+/g, 'sample'))
  const missingPageHelp = routedPages.filter(routePath => !getPageHelp(routePath))
  if (missingPageHelp.length) failures.push(`Page help is missing for routed pages: ${missingPageHelp.join(', ')}`)
}

const sqlDir = path.join(root, 'supabase')
const sqlFiles = fs.readdirSync(sqlDir).filter(name => name.endsWith('.sql'))
if (sqlFiles.length !== 1 || sqlFiles[0] !== 'setup.sql') {
  failures.push(`supabase/ must contain exactly one SQL installer named setup.sql; found: ${sqlFiles.join(', ') || 'none'}`)
}

const setupPath = path.join(sqlDir, 'setup.sql')
if (fs.existsSync(setupPath)) {
  const sql = fs.readFileSync(setupPath, 'utf8').toLowerCase()
  const obsolete = [
    'service_targets', 'complaint_escalations', 'customer_acknowledged_at',
    'customer_acknowledgment_note', 'service_target_due_at', 'escalated_at',
    'acknowledged_at', 'estimated_completion_at',
    'service_target_change',
  ]
  const found = obsolete.filter(term => sql.includes(term))
  if (found.length) failures.push(`Fresh setup.sql contains obsolete workflow artifacts: ${found.join(', ')}`)

  const requiredRouting = [
    'public.divisions', "'nscccd'", "'wdlcd'", 'division_id', 'routed_division_id',
    'route_field_complaint_to_wdlcd', 'guard_maintenance_crew_division',
  ]
  const missingRouting = requiredRouting.filter(term => !sql.includes(term))
  if (missingRouting.length) failures.push(`Fresh setup.sql is missing division-routing baseline: ${missingRouting.join(', ')}`)
}


const uiFiles = files.filter(file => rel(file).startsWith('src/') && /\.(jsx?|css)$/.test(file))
for (const file of uiFiles) {
  const name = rel(file)
  const content = fs.readFileSync(file, 'utf8')
  if (/text-\[(?:9|10|11)px\]|text-gray-400/.test(content)) failures.push(`Readability regression found in ${name}: use text-xs or larger and avoid low-contrast text-gray-400.`)
  if (name !== 'src/components/ui/Dialog.jsx' && content.includes('fixed inset-0 z-50')) failures.push(`Ad-hoc modal overlay found in ${name}; use the shared Dialog component.`)
  if (name.startsWith('src/pages/') && !name.startsWith('src/pages/auth/')) {
    const waveHeaders = [...content.matchAll(/className="([^"]*page-band wave-header[^"]*)"/g)]
    if (waveHeaders.some(match => !match[1].includes('page-header'))) failures.push(`Unstandardized page wave header found in ${name}; use the shared page-header geometry.`)
  }
}

const terminologyFiles = files.filter(file => /^(src|server\/src)\//.test(rel(file)) && /\.(jsx?|mjs)$/.test(file))
const terminologyDriftRules = [
  { pattern: /\bPending Review\b/, preferred: 'Pending review' },
  { pattern: /\bIn Progress\b/, preferred: 'In progress' },
  { pattern: /\bNeeds Attention\b/, preferred: 'Needs attention' },
  { pattern: /\b(?:Awaiting|Waiting for) WDLCD Verification\b/i, preferred: 'Resolved' },
  { pattern: /\bAccounts & Billing\b/, preferred: 'Accounts & billing' },
  { pattern: /\bService Advisories\b/, preferred: 'Service advisories' },
  { pattern: /\bComplaint Analytics\b/, preferred: 'Complaint analytics' },
  { pattern: /\bExports & (?:Scheduled Reports|Schedules)\b/, preferred: 'Exports & schedules' },
  { pattern: /\b(?:On Leave|Off Duty)\b/, preferred: 'On leave / Off duty' },
  { pattern: /\bfield-work\b/i, preferred: 'field work' },
  { pattern: /\bCommercial review\b/, preferred: 'Commercial Services review' },
]

for (const file of terminologyFiles) {
  const content = fs.readFileSync(file, 'utf8')
  const drift = terminologyDriftRules.find(rule => rule.pattern.test(content))
  if (drift) failures.push(`Terminology drift found in ${rel(file)}; use “${drift.preferred}”.`)
}

const secretPatterns = [
  { label: 'Supabase secret key', regex: /sb_secret_[A-Za-z0-9_-]{16,}/g },
  { label: 'JWT-like secret', regex: /eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}/g },
  { label: 'Vite service-role variable', regex: /VITE_SUPABASE_SERVICE_ROLE_KEY/g },
  { label: 'Vite cron secret', regex: /VITE_CRON_SECRET/g },
]

for (const file of textFiles) {
  if (rel(file) === 'scripts/check-source.mjs') continue
  const content = fs.readFileSync(file, 'utf8')
  for (const pattern of secretPatterns) {
    if (pattern.regex.test(content)) failures.push(`${pattern.label} found in ${rel(file)}`)
    pattern.regex.lastIndex = 0
  }
}

if (failures.length) {
  console.error('Source integrity check failed:')
  failures.forEach(item => console.error(`- ${item}`))
  process.exit(1)
}

console.log(`Source integrity check passed (${files.length} files scanned).`)
