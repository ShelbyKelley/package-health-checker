import { useEffect, useState } from 'react'

import Notes from './components/Notes'
import Tool from './components/Tool'

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
    <div className="min-h-screen bg-surface text-body transition-colors duration-420 px-[clamp(20px,6vw,88px)]">
      {/* This header (top nav + "Package health checker" title) and the
          hero section below it are specific to this standalone site and
          must stay out of src/components/ — the portfolio embed brings its
          own nav and page title. Only files listed in
          src/components/sync-manifest.txt ship to the portfolio repo, and
          App.jsx is deliberately not one of them. */}
      <header className="flex items-baseline justify-between gap-6 flex-wrap max-w-270 mx-auto pt-7 border-b border-subtle">
        <h1 className="font-mono text-[13px] tracking-[0.16em] uppercase text-brand-secondary pb-4.5 m-0">
          Package health checker
        </h1>
        <nav className="flex items-center gap-5 pb-4.5 font-mono text-[13px]">
          <a href="#tool" className="text-body no-underline hover:text-brand">
            tool
          </a>
          <a href="#notes" className="text-body no-underline hover:text-brand">
            notes
          </a>
          {/* The visible label names the target mode, which is ambiguous out
              of context, so the accessible name spells out the action. */}
          <button
            type="button"
            onClick={() => setDarkMode((isDark) => !isDark)}
            aria-label={
              darkMode ? 'Switch to light mode' : 'Switch to dark mode'
            }
            className="rounded-full border border-body px-3.5 py-1.5 font-mono text-xs text-heading hover:border-brand hover:text-brand transition-colors duration-200"
          >
            {darkMode ? 'light mode' : 'dark mode'}
          </button>
        </nav>
      </header>

      <section className="max-w-270 mx-auto pt-[clamp(48px,9vh,88px)] pb-[clamp(32px,5vh,52px)]">
        <p className="font-mono text-[13px] tracking-[0.14em] uppercase text-brand-secondary mb-6">
          A portfolio project with live vulnerability data from OSV.dev
        </p>
        <h2
          className="font-heading font-light text-heading m-0 max-w-[20ch]"
          style={{
            fontSize: 'clamp(40px, 7vw, 76px)',
            lineHeight: 1.04,
            letterSpacing: '-0.022em',
          }}
        >
          Find out what&rsquo;s <em className="italic text-brand">actually</em>{' '}
          broken in your dependencies.
        </h2>
        <p className="mt-7 text-body max-w-[56ch]">
          Look up a single npm package, or drop in a package-lock.json and get a
          report you can hand to someone. Nothing is uploaded. The lockfile is
          parsed in your browser, and each dependency is checked against{' '}
          <a href="https://osv.dev" target="_blank" rel="noopener noreferrer">
            OSV.dev
          </a>{' '}
          directly.
        </p>
      </section>

      <main className="max-w-270 mx-auto pb-[clamp(56px,10vh,104px)]">
        <Tool />
      </main>

      <Notes />
    </div>
  )
}

export default App
