import { useEffect, useState } from 'react'

type Theme = 'light' | 'dark'

const STORAGE_KEY = 'wordtrain.theme'

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null
    if (stored === 'light' || stored === 'dark') return stored
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    return prefersDark ? 'dark' : 'light'
  })

  useEffect(() => {
    // Apply theme class to both <html> and <body>
    const root = document.documentElement
    root.classList.remove('light', 'dark')
    document.body.classList.remove('light', 'dark')
    root.classList.add(theme)
    document.body.classList.add(theme)
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  // Optionally react to system changes if user hasn't set a preference
  useEffect(() => {
    const m = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (!stored) setTheme(m.matches ? 'dark' : 'light')
    }
    m.addEventListener?.('change', onChange)
    return () => m.removeEventListener?.('change', onChange)
  }, [])

  function toggleTheme() {
    setTheme((t) => (t === 'light' ? 'dark' : 'light'))
  }

  return { theme, toggleTheme }
}
