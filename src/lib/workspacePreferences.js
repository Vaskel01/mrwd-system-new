const PREFIX = 'mrwd.workspace.'

export function readWorkspacePreferences(moduleKey) {
  if (typeof window === 'undefined') return {}
  try {
    const value = window.localStorage.getItem(`${PREFIX}${moduleKey}`)
    return value ? JSON.parse(value) : {}
  } catch {
    return {}
  }
}

export function writeWorkspacePreferences(moduleKey, preferences) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(`${PREFIX}${moduleKey}`, JSON.stringify(preferences))
  } catch {
    // A blocked or full browser store should never prevent queue work.
  }
}
