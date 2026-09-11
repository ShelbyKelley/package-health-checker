import { useEffect, useState } from 'react'

import PackageHealthCheckerTool from './components/PackageHealthCheckerTool'

const THEME_STORAGE_KEY = 'theme'

// Safari's private mode and some embedded webviews throw on localStorage
// access rather than returning null, so every access is guarded. A broken
// theme preference must never take the whole page down with it.
function readStoredTheme() {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY)
  } catch {
    return null
  }
}

function storeTheme(theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Preference just won't persist; not worth interrupting the user over.
  }
}

function getInitialDarkMode() {
  const stored = readStoredTheme()
  if (stored === 'dark' || stored === 'light') {
    return stored === 'dark'
  }
  // No stored choice yet, so honour the OS setting instead of assuming light.
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function App() {
  const [darkMode, setDarkMode] = useState(getInitialDarkMode)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
    storeTheme(darkMode ? 'dark' : 'light')
  }, [darkMode])

  return (
    <div className="min-h-screen bg-surface px-6 py-12 transition-colors">
      <div className="max-w-2xl mx-auto">
        <header className="flex items-center justify-between mb-6">
          <h1 className="font-heading text-3xl font-light text-heading">
            Package Health Checker
          </h1>
          {/* The visible label names the target mode, which is ambiguous out
              of context, so the accessible name spells out the action. */}
          <button
            type="button"
            onClick={() => setDarkMode((isDark) => !isDark)}
            aria-label={
              darkMode ? 'Switch to light mode' : 'Switch to dark mode'
            }
            className="rounded-full border border-body px-4 py-2 font-mono text-[13px] text-body hover:border-brand hover:text-brand transition-colors duration-200"
          >
            {darkMode ? 'light mode' : 'dark mode'}
          </button>
        </header>

        <main>
          <PackageHealthCheckerTool />
        </main>
      </div>
    </div>
  )
}

export default App
