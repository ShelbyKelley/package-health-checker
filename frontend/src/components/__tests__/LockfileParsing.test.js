import { describe, expect, it } from 'vitest'

import { parseLockfile, SAMPLE_LOCKFILE } from '../LockfileParsing'

function lockfile(packages, extra = {}) {
  return JSON.stringify({
    name: 'app',
    version: '1.0.0',
    lockfileVersion: 3,
    packages: { '': { name: 'app', version: '1.0.0' }, ...packages },
    ...extra,
  })
}

describe('rejecting the wrong input', () => {
  it('rejects invalid JSON', () => {
    expect(parseLockfile('{ not json')).toEqual({
      error: 'Not valid JSON — check for a trailing comma.',
    })
  })

  it('rejects a package.json and explains why a lockfile is needed', () => {
    const packageJson = JSON.stringify({
      name: 'app',
      dependencies: { lodash: '^4.17.19' },
    })
    expect(parseLockfile(packageJson).error).toMatch(
      /package\.json.*version ranges.*package-lock\.json/
    )
  })

  it('rejects a v1 lockfile, which has no packages map, with how to regenerate', () => {
    const v1 = JSON.stringify({
      name: 'app',
      lockfileVersion: 1,
      dependencies: { lodash: { version: '4.17.19' } },
    })
    expect(parseLockfile(v1).error).toMatch(/npm install --package-lock-only/)
  })

  it.each([
    ['an array', '["lodash@4.17.19"]'],
    ['an unrelated object', '{ "lodash": "4.17.19" }'],
    ['a bare value', '42'],
  ])('rejects %s', (_label, text) => {
    expect(parseLockfile(text).error).toBe(
      'That isn’t a package-lock.json file.'
    )
  })

  it('reports a lockfile with nothing installed', () => {
    expect(parseLockfile(lockfile({})).error).toBe(
      'No installed packages found in that lockfile.'
    )
  })
})

describe('walking the dependency tree', () => {
  it('includes transitive dependencies, not just direct ones', () => {
    const { packages } = parseLockfile(
      lockfile({
        'node_modules/express': { version: '4.18.1' },
        'node_modules/body-parser': { version: '1.20.0' },
        'node_modules/body-parser/node_modules/raw-body': { version: '2.5.1' },
      })
    )
    expect(packages).toEqual([
      { name: 'body-parser', version: '1.20.0' },
      { name: 'express', version: '4.18.1' },
      { name: 'raw-body', version: '2.5.1' },
    ])
  })

  it('keeps every version when one package is installed at two', () => {
    // Keying by name alone would silently audit only one of these.
    const { packages } = parseLockfile(
      lockfile({
        'node_modules/qs': { version: '6.10.3' },
        'node_modules/body-parser/node_modules/qs': { version: '6.9.7' },
      })
    )
    expect(packages).toEqual([
      { name: 'qs', version: '6.10.3' },
      { name: 'qs', version: '6.9.7' },
    ])
  })

  it('audits an identical name@version only once, however many paths install it', () => {
    const { packages } = parseLockfile(
      lockfile({
        'node_modules/a/node_modules/ms': { version: '2.1.3' },
        'node_modules/b/node_modules/ms': { version: '2.1.3' },
      })
    )
    expect(packages).toEqual([{ name: 'ms', version: '2.1.3' }])
  })

  it('handles scoped packages, including nested ones', () => {
    const { packages } = parseLockfile(
      lockfile({
        'node_modules/@babel/core': { version: '7.24.0' },
        'node_modules/@babel/core/node_modules/@babel/parser': {
          version: '7.24.1',
        },
      })
    )
    expect(packages).toEqual([
      { name: '@babel/core', version: '7.24.0' },
      { name: '@babel/parser', version: '7.24.1' },
    ])
  })

  it('uses the real package name for an aliased install', () => {
    // "my-lodash": "npm:lodash@4.17.19" installs at node_modules/my-lodash.
    const { packages } = parseLockfile(
      lockfile({
        'node_modules/my-lodash': { name: 'lodash', version: '4.17.19' },
      })
    )
    expect(packages).toEqual([{ name: 'lodash', version: '4.17.19' }])
  })

  it('skips the project root, workspace sources, links, and versionless entries', () => {
    const { packages } = parseLockfile(
      lockfile({
        'packages/internal-lib': { name: 'internal-lib', version: '0.1.0' },
        'node_modules/internal-lib': {
          resolved: 'packages/internal-lib',
          link: true,
        },
        'node_modules/broken': {},
        'node_modules/lodash': { version: '4.17.19' },
      })
    )
    expect(packages).toEqual([{ name: 'lodash', version: '4.17.19' }])
  })

  it('accepts a v2 lockfile, which also carries the packages map', () => {
    const v2 = lockfile(
      { 'node_modules/lodash': { version: '4.17.19' } },
      { lockfileVersion: 2 }
    )
    expect(parseLockfile(v2).packages).toEqual([
      { name: 'lodash', version: '4.17.19' },
    ])
  })
})

describe('SAMPLE_LOCKFILE', () => {
  it('parses, and shows off both transitive deps and a doubly-installed package', () => {
    const { packages, error } = parseLockfile(SAMPLE_LOCKFILE)
    expect(error).toBeUndefined()
    expect(packages.map((p) => p.name)).toContain('follow-redirects')
    expect(packages.filter((p) => p.name === 'qs')).toHaveLength(2)
  })
})
