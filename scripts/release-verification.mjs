// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const CHECK = {
  id: 'canonical-hardening-fixtures',
  name: 'Canonical hardening fixtures',
  requirementIds: ['EF-1'],
  command: 'npm run validate:fixtures --workspace console',
  executable: 'npm',
  arguments: ['run', 'validate:fixtures', '--workspace', 'console'],
}
const CATALOG_PATH = 'console/tests/fixtures/hardening/catalog.json'
const REPOSITORIES = [
  { name: 'openfray', path: '.' },
  { name: 'console', path: 'console' },
  { name: 'site', path: 'site' },
  { name: 'handbook', path: 'handbook' },
]
const ENVIRONMENTS = new Set(['local', 'staging', 'production'])
const APPROVERS = new Set(['pending', 'maintainer'])
const FIXTURE_ID = /^hardening\.[a-z0-9-]+(?:\.\d+)?\.v[1-9]\d*$/
const FIXTURE_CLASS = /^[a-z][a-z0-9-]*$/
const FIXTURE_FILE = /^[a-z0-9-]+\.json$/
const SHA256 = /^[0-9a-f]{64}$/
const COMMIT = /^[0-9a-f]{40}$/

/** Return a SHA-256 fingerprint for exact file bytes. */
function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

/** Read the supported command-line options without accepting free-form evidence values. */
function parseOptions(arguments_) {
  const options = {
    output: '.artifacts/release-verification',
    environment: 'local',
    approver: 'pending',
    rollbackTarget: null,
  }
  for (let index = 0; index < arguments_.length; index += 2) {
    const option = arguments_[index]
    const value = arguments_[index + 1]
    if (typeof value !== 'string') throw new Error(`Missing value for ${option}`)
    if (option === '--output') options.output = value
    else if (option === '--environment' && ENVIRONMENTS.has(value)) options.environment = value
    else if (option === '--approver' && APPROVERS.has(value)) options.approver = value
    else if (option === '--rollback-target' && COMMIT.test(value)) options.rollbackTarget = value
    else throw new Error(`Unsupported release-verification option: ${option}`)
  }
  return options
}

/** Run Git and return a privacy-safe immutable commit, or null when unavailable. */
function repositoryCommit(root, path) {
  const result = spawnSync('git', ['-C', resolve(root, path), 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
  })
  const commit = result.status === 0 ? result.stdout.trim() : ''
  return COMMIT.test(commit) ? commit : null
}

/** Return whether tracked and untracked workspace changes are absent. */
function isCleanWorkspace(root) {
  const result = spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' })
  return result.status === 0 && result.stdout.trim() === ''
}

/** Capture coordinated repository commits without branch names or remotes. */
function repositoryEvidence(root) {
  return REPOSITORIES.map((repository) => ({
    name: repository.name,
    commit: repositoryCommit(root, repository.path),
  }))
}

/** Capture the workspace lockfile hash without reading dependency contents into evidence. */
function lockfileEvidence(root) {
  try {
    const bytes = readFileSync(resolve(root, 'package-lock.json'))
    return [{ path: 'package-lock.json', sha256: sha256(bytes) }]
  } catch {
    return []
  }
}

/** Return whether the console declares the fixture command selected by this gate. */
function hasFixtureCommand(root) {
  try {
    const packageJson = JSON.parse(readFileSync(resolve(root, 'console/package.json'), 'utf8'))
    return typeof packageJson?.scripts?.['validate:fixtures'] === 'string'
  } catch {
    return false
  }
}

/** Capture only validated fixture identities and hashes from the canonical catalog. */
function fixtureEvidence(root) {
  try {
    const catalog = JSON.parse(readFileSync(resolve(root, CATALOG_PATH), 'utf8'))
    if (catalog?.catalogVersion !== 1 || !Array.isArray(catalog.fixtures)) return null
    const fixtures = catalog.fixtures.map((fixture) => {
      if (
        !FIXTURE_ID.test(fixture?.id ?? '') ||
        !FIXTURE_CLASS.test(fixture?.fixtureClass ?? '') ||
        !SHA256.test(fixture?.sha256 ?? '') ||
        !FIXTURE_FILE.test(fixture?.path ?? '')
      ) {
        throw new Error('Invalid fixture evidence metadata')
      }
      const bytes = readFileSync(resolve(root, 'console/tests/fixtures/hardening', fixture.path))
      if (sha256(bytes) !== fixture.sha256) throw new Error('Fixture hash mismatch')
      return {
        id: fixture.id,
        fixtureClass: fixture.fixtureClass,
        sha256: fixture.sha256,
      }
    })
    return fixtures.length > 0 ? fixtures : null
  } catch {
    return null
  }
}

/** Run the selected acceptance check without copying its output into release evidence. */
function runFixtureCheck(root, fixtures) {
  const startedAt = new Date().toISOString()
  const commandAvailable = hasFixtureCommand(root)
  let result = 'missing'
  let exitCode = null
  if (commandAvailable && fixtures !== null) {
    const execution = spawnSync(CHECK.executable, CHECK.arguments, {
      cwd: root,
      encoding: 'utf8',
      stdio: 'pipe',
    })
    exitCode = Number.isInteger(execution.status) ? execution.status : null
    result = execution.status === 0 ? 'passed' : 'failed'
  }
  return {
    id: CHECK.id,
    name: CHECK.name,
    requirementIds: CHECK.requirementIds,
    applicable: true,
    command: CHECK.command,
    result,
    exitCode,
    startedAt,
    completedAt: new Date().toISOString(),
  }
}

/** Format an ISO timestamp for the fixed human-readable report vocabulary. */
function displayTimestamp(value) {
  return value.replace('T', ' ').replace('.000Z', ' UTC')
}

/** Capitalize a fixed evidence status for report tables. */
function displayStatus(value) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`
}

/** Render a privacy-safe Markdown view of one evidence manifest. */
function renderReport(manifest) {
  const lines = [
    '# Release verification report',
    '',
    `- **Result:** ${displayStatus(manifest.result)}`,
    `- **Release class:** Advisory`,
    `- **Environment:** ${displayStatus(manifest.environment.identity)}`,
    `- **Generated:** ${displayTimestamp(manifest.generatedAt)}`,
    `- **Approver:** ${displayStatus(manifest.approver)}`,
    `- **Rollback target:** ${manifest.rollbackTarget ?? 'Not applicable'}`,
    `- **Working tree:** ${manifest.inputs.workingTreeClean ? 'Clean' : 'Has uncommitted changes'}`,
    '',
    '## Immutable inputs',
    '',
    '### Repository commits',
    '',
    '| Repository | Commit |',
    '| --- | --- |',
  ]
  for (const repository of manifest.inputs.repositories) {
    lines.push(`| ${repository.name} | ${repository.commit ?? 'Missing'} |`)
  }
  lines.push('', '### Lockfiles', '', '| Path | SHA-256 |', '| --- | --- |')
  if (manifest.inputs.lockfiles.length === 0) lines.push('| package-lock.json | Missing |')
  for (const lockfile of manifest.inputs.lockfiles) {
    lines.push(`| ${lockfile.path} | ${lockfile.sha256} |`)
  }
  lines.push('', '### Fixtures', '', '| Identity | Class | SHA-256 |', '| --- | --- | --- |')
  if (manifest.inputs.fixtures.length === 0) lines.push('| Missing | Missing | Missing |')
  for (const fixture of manifest.inputs.fixtures) {
    lines.push(`| ${fixture.id} | ${fixture.fixtureClass} | ${fixture.sha256} |`)
  }
  lines.push(
    '',
    '## Checks',
    '',
    '| Requirement | Check | Command | Result |',
    '| --- | --- | --- | --- |',
  )
  for (const check of manifest.checks) {
    lines.push(
      `| ${check.requirementIds.join(', ')} | ${check.name} | \`${check.command}\` | ${displayStatus(check.result)} |`,
    )
  }
  lines.push(
    '',
    'The verifier is advisory. A failed or missing check does not block an ordinary release.',
    '',
  )
  return lines.join('\n')
}

/** Execute the advisory release gate and write both evidence artifacts. */
export function verifyRelease({ root = process.cwd(), ...options }) {
  const repositories = repositoryEvidence(root)
  const lockfiles = lockfileEvidence(root)
  const fixtures = fixtureEvidence(root)
  const workingTreeClean = isCleanWorkspace(root)
  const check = runFixtureCheck(root, fixtures)
  const inputsComplete =
    repositories.every((repository) => repository.commit !== null) &&
    lockfiles.length > 0 &&
    fixtures !== null &&
    workingTreeClean
  const passed = inputsComplete && check.result === 'passed'
  const manifest = {
    schemaVersion: 1,
    releaseClass: 'advisory',
    result: passed ? 'passed' : 'failed',
    generatedAt: new Date().toISOString(),
    approver: options.approver,
    rollbackTarget: options.rollbackTarget,
    environment: {
      identity: options.environment,
      runtime: {
        node: process.version,
        platform: process.platform,
        architecture: process.arch,
      },
    },
    inputs: {
      repositories,
      lockfiles,
      fixtures: fixtures ?? [],
      workingTreeClean,
    },
    checks: [check],
  }
  const output = resolve(root, options.output)
  mkdirSync(output, { recursive: true })
  writeFileSync(resolve(output, 'evidence-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  writeFileSync(resolve(output, 'release-report.md'), renderReport(manifest))
  return manifest
}

/** Parse the command line, execute verification, and set its release-safe exit status. */
function main() {
  const options = parseOptions(process.argv.slice(2))
  const manifest = verifyRelease(options)
  console.log(`Release verification ${manifest.result}. Evidence written to ${options.output}.`)
  if (manifest.result !== 'passed') process.exitCode = 1
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
