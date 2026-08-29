const THEME_STORAGE_KEY = 'mrwd-color-theme'

export function getStoredTheme() {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY)
    return value === 'dark' || value === 'light' ? value : null
  } catch {
    return null
  }
}

export function getInitialTheme() {
  const storedTheme = getStoredTheme()
  if (storedTheme) return storedTheme
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyTheme(theme) {
  const activeTheme = theme === 'dark' ? 'dark' : 'light'
  document.documentElement.dataset.theme = activeTheme
  document.documentElement.style.colorScheme = activeTheme

  const themeColor = document.querySelector('meta[name="theme-color"]')
  if (themeColor) themeColor.setAttribute('content', activeTheme === 'dark' ? '#0b1220' : '#f4f7fb')
}

export function saveTheme(theme) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // The selected theme still applies for this session when storage is unavailable.
  }
}

export function initializeTheme() {
  const theme = getInitialTheme()
  applyTheme(theme)
  return theme
}

