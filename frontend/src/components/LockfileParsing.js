// Parses an npm package-lock.json (lockfileVersion 2 or 3) into the list of
// packages actually installed, walking the whole dependency tree the way
// `npm audit` does, not just the direct dependencies a package.json lists.
//
// Only lockfiles are accepted, on purpose. A package.json records version
// *ranges* ("^4.17.19"), not what's installed, and OSV doesn't reject a
// range it can't parse; it returns a confident, plausible, wrong answer.
// A lockfile records the exact installed version of every package, which is
// the only input that makes a per-version advisory lookup meaningful.
export function parseLockfile(text) {
  let data
  try {
    data = JSON.parse(text)
  } catch {
    return { error: 'Not valid JSON — check for a trailing comma.' }
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { error: 'That isn’t a package-lock.json file.' }
  }

  if (!('lockfileVersion' in data)) {
    return data.dependencies || data.devDependencies
      ? {
          error:
            'That looks like a package.json, which lists version ranges rather than what’s installed. Drop your package-lock.json instead.',
        }
      : { error: 'That isn’t a package-lock.json file.' }
  }

  if (!data.packages || typeof data.packages !== 'object') {
    return {
      error:
        'This lockfile is from npm 6 or older. Regenerate it with a newer npm by running: npm install --package-lock-only',
    }
  }

  // Keyed by name@version rather than name: one tree routinely installs the
  // same package at two versions, and each version has its own advisories.
  const installed = new Map()
  for (const [path, meta] of Object.entries(data.packages)) {
    // "" is the project itself. Paths without node_modules/ are workspace
    // sources, and link entries are symlinks to them; none are registry
    // installs with their own published advisories.
    if (!path.includes('node_modules/') || !meta || meta.link) continue
    if (typeof meta.version !== 'string' || !meta.version) continue

    // An aliased install ("foo": "npm:bar@1.0.0") lives at node_modules/foo
    // but is really the package "bar", which the entry records as its name.
    const name = meta.name || path.split('node_modules/').pop()
    const key = `${name}@${meta.version}`
    if (!installed.has(key)) {
      installed.set(key, { name, version: meta.version })
    }
  }

  if (!installed.size) {
    return { error: 'No installed packages found in that lockfile.' }
  }

  const packages = [...installed.values()].sort(
    (a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version)
  )
  return { packages }
}

// A small but realistic tree: direct dependencies plus the transitive ones
// they pull in, including one package installed at two versions, so the
// sample shows what a lockfile audit catches that a package.json can't.
export const SAMPLE_LOCKFILE = JSON.stringify(
  {
    name: 'billing-service',
    version: '1.0.0',
    lockfileVersion: 3,
    requires: true,
    packages: {
      '': {
        name: 'billing-service',
        version: '1.0.0',
        dependencies: {
          axios: '^0.21.0',
          express: '^4.18.1',
          lodash: '^4.17.19',
        },
      },
      'node_modules/axios': { version: '0.21.0' },
      'node_modules/follow-redirects': { version: '1.13.0' },
      'node_modules/express': { version: '4.18.1' },
      'node_modules/body-parser': { version: '1.20.0' },
      'node_modules/qs': { version: '6.10.3' },
      'node_modules/cookie': { version: '0.5.0' },
      'node_modules/lodash': { version: '4.17.19' },
      'node_modules/body-parser/node_modules/qs': { version: '6.9.7' },
    },
  },
  null,
  2
)
