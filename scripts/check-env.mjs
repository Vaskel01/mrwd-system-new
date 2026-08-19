import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()

function parseEnv(file) {
  if (!fs.existsSync(file)) return null
  const values = {}
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const idx = line.indexOf('=')
    if (idx < 0) continue
    values[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
  }
  return values
}

const checks = [
  {
    file: path.join(root, '.env'),
    example: '.env.example',
    required: ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_API_URL'],
  },
  {
    file: path.join(root, 'server', '.env'),
    example: 'server/.env.example',
    required: ['SUPABASE_URL', 'SUPABASE_ANON_KEY'],
    recommended: ['SUPABASE_SERVICE_ROLE_KEY', 'CRON_SECRET', 'PASSWORD_RESET_REDIRECT_URL'],
  },
]

let failed = false
for (const check of checks) {
  const values = parseEnv(check.file)
  if (!values) {
    console.error(`Missing ${path.relative(root, check.file)}. Copy ${check.example} first.`)
    failed = true
    continue
  }
  for (const key of check.required) {
    if (!values[key]) {
      console.error(`Missing required value: ${key} in ${path.relative(root, check.file)}`)
      failed = true
    }
  }
  for (const key of check.recommended || []) {
    if (!values[key]) console.warn(`Recommended for production: ${key}`)
  }
}

if (failed) process.exit(1)
console.log('Environment files contain the required local-development variables.')
