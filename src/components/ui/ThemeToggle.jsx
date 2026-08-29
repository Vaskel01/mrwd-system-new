import { useEffect, useState } from 'react'
import { applyTheme, getInitialTheme, getStoredTheme, saveTheme } from '../../lib/theme'

export default function ThemeToggle() {
  const [theme, setTheme] = useState(getInitialTheme)
  const isDark = theme === 'dark'

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!media) return undefined

    const followSystemTheme = event => {
      if (getStoredTheme()) return
      const nextTheme = event.matches ? 'dark' : 'light'
      applyTheme(nextTheme)
      setTheme(nextTheme)
    }

    media.addEventListener?.('change', followSystemTheme)
    return () => media.removeEventListener?.('change', followSystemTheme)
  }, [])

  const toggleTheme = () => {
    const nextTheme = isDark ? 'light' : 'dark'
    saveTheme(nextTheme)
    applyTheme(nextTheme)
    setTheme(nextTheme)
  }

  const actionLabel = isDark ? 'Switch to light mode' : 'Switch to dark mode'

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      aria-label={actionLabel}
      aria-pressed={isDark}
      title={actionLabel}
    >
      <span className="theme-toggle__icon" aria-hidden="true">{isDark ? '☀' : '☾'}</span>
    </button>
  )
}

