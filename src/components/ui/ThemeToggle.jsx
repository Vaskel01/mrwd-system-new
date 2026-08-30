import { useEffect, useState } from 'react'
import { applyTheme, getInitialTheme, getStoredTheme, saveTheme } from '../../lib/theme'

export default function ThemeToggle({ variant = 'icon' }) {
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
  const isMenuItem = variant === 'menu'

  return (
    <button
      type="button"
      className={`theme-toggle${isMenuItem ? ' theme-toggle--menu' : ''}`}
      onClick={toggleTheme}
      aria-label={actionLabel}
      aria-pressed={isDark}
      title={actionLabel}
    >
      <span className="theme-toggle__icon" aria-hidden="true">{isDark ? '☀' : '☾'}</span>
      {isMenuItem && (
        <span className="min-w-0 text-left">
          <span className="block text-sm font-bold">Appearance</span>
          <span className="block text-xs font-medium opacity-70">{isDark ? 'Dark mode' : 'Light mode'}</span>
        </span>
      )}
    </button>
  )
}
