import { useState, useEffect } from 'react'

import PackageHealthCheckerTool from './components/PackageHealthCheckerTool'

function App() {
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('theme')
    return saved === 'dark'
  })

  useEffect(() => {
    const root = document.documentElement
    if (darkMode) {
      root.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    } else {
      root.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    }
  }, [darkMode])

  return (
    <div className="min-h-screen bg-surface px-6 py-12 transition-colors">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-heading text-3xl font-light text-heading">
            Package Health Checker
          </h1>
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="rounded-full border border-subtle px-4 py-2 font-mono text-[13px] text-body hover:border-brand hover:text-brand transition-colors duration-200"
          >
            {darkMode ? 'light mode' : 'dark mode'}
          </button>
        </div>

        <PackageHealthCheckerTool />
      </div>
    </div>
  )
}

export default App
