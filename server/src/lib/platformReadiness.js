function projectRef(environment) {
  if (environment.SUPABASE_PROJECT_REF) return environment.SUPABASE_PROJECT_REF.trim()
  try { return new URL(environment.SUPABASE_URL).hostname.split('.')[0] } catch { return '' }
}

function text(value) {
  return String(value ?? '').trim()
}

async function managementRequest(path, environment, fetchImpl) {
  const response = await fetchImpl(`https://api.supabase.com/v1/projects/${projectRef(environment)}${path}`, {
    headers: { Authorization: `Bearer ${environment.SUPABASE_MANAGEMENT_TOKEN}` },
    signal: AbortSignal.timeout(8000),
  })
  if (!response.ok) throw new Error(`Management API returned HTTP ${response.status}.`)
  return response.json()
}

export async function getPlatformReadiness(environment = process.env, fetchImpl = fetch) {
  if (!text(environment.SUPABASE_MANAGEMENT_TOKEN) || !projectRef(environment)) {
    return {
      configured: false,
      auth: { status: 'not_checked', custom_smtp: null, leaked_password_protection: null },
      backups: { status: 'not_checked', latest_completed_at: null, pitr_enabled: null },
    }
  }

  const [authResult, backupResult] = await Promise.allSettled([
    managementRequest('/config/auth', environment, fetchImpl),
    managementRequest('/database/backups', environment, fetchImpl),
  ])
  const auth = authResult.status === 'fulfilled' ? authResult.value : null
  const backupData = backupResult.status === 'fulfilled' ? backupResult.value : null
  const backupRows = Array.isArray(backupData) ? backupData : backupData?.backups || []
  const completedBackups = backupRows
    .filter(item => String(item.status).toUpperCase() === 'COMPLETED' && item.inserted_at)
    .sort((left, right) => new Date(right.inserted_at) - new Date(left.inserted_at))

  return {
    configured: true,
    auth: auth
      ? {
          status: 'online',
          custom_smtp: Boolean(auth.smtp_host && auth.smtp_user),
          leaked_password_protection: auth.password_hibp_enabled === true,
          minimum_password_length: Number(auth.password_min_length) || null,
        }
      : {
          status: 'degraded', custom_smtp: null, leaked_password_protection: null,
          error: authResult.reason?.message || 'Auth configuration check failed.',
        },
    backups: backupData
      ? {
          status: 'online',
          latest_completed_at: completedBackups[0]?.inserted_at || null,
          pitr_enabled: backupData.pitr_enabled === true,
          backup_count: completedBackups.length,
        }
      : {
          status: 'degraded', latest_completed_at: null, pitr_enabled: null,
          error: backupResult.reason?.message || 'Backup availability check failed.',
        },
  }
}
