import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

// sync-manifest.txt is an explicit allowlist of the files copied into the
// portfolio repo. Its one weakness is that it can silently drift: if a
// synced component imports a file that isn't listed, the portfolio copy gets
// a broken import and that repo's build fails, far from the change that
// caused it. These tests turn that into a failure here, in this repo's CI.

const componentsDir = join(dirname(fileURLToPath(import.meta.url)), '..')

function readManifest() {
  return readFileSync(join(componentsDir, 'sync-manifest.txt'), 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
}

// Relative imports like './Constants' or '../Foo', resolved to a filename.
function relativeImportsOf(file) {
  const source = readFileSync(join(componentsDir, file), 'utf8')
  const specifiers = [...source.matchAll(/from\s+['"](\.{1,2}\/[^'"]+)['"]/g)]
  return specifiers.map(([, specifier]) => specifier)
}

function resolveToFile(specifier) {
  for (const ext of ['', '.jsx', '.js']) {
    const candidate = specifier.replace(/^\.\//, '') + ext
    if (existsSync(join(componentsDir, candidate))) return candidate
  }
  return null
}

describe('sync-manifest.txt', () => {
  const manifest = readManifest()

  it('lists only files that actually exist', () => {
    const missing = manifest.filter(
      (file) => !existsSync(join(componentsDir, file))
    )
    expect(missing).toEqual([])
  })

  it('has no duplicate entries', () => {
    expect(new Set(manifest).size).toBe(manifest.length)
  })

  it('includes every file a synced component imports', () => {
    const unlisted = []
    for (const file of manifest) {
      for (const specifier of relativeImportsOf(file)) {
        // Anything reaching outside components/ couldn't be synced at all,
        // which is its own bug, so fail loudly rather than skip it.
        if (specifier.startsWith('../')) {
          unlisted.push(`${file} imports ${specifier} (outside components/)`)
          continue
        }
        const target = resolveToFile(specifier)
        if (!target || !manifest.includes(target)) {
          unlisted.push(`${file} imports ${specifier}`)
        }
      }
    }
    expect(unlisted).toEqual([])
  })

  it('never ships a test file to the portfolio', () => {
    expect(manifest.filter((file) => /\.test\.[jt]sx?$/.test(file))).toEqual([])
  })

  it('covers every non-test source file in components/', () => {
    // A new component that nothing synced imports would slip past the
    // import check above, so also catch plain omissions.
    const sourceFiles = readdirSync(componentsDir).filter(
      (file) => /\.(jsx|js)$/.test(file) && !/\.test\./.test(file)
    )
    const unlisted = sourceFiles.filter((file) => !manifest.includes(file))
    expect(unlisted).toEqual([])
  })
})
