import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  // stubGlobal and stubEnv are NOT undone by restoreAllMocks. Without these
  // two, a stubbed fetch leaks into the next test and the suite only passes
  // because of the order it happens to run in.
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})
