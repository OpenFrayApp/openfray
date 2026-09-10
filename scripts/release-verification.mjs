// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const FIXTURE_CHECK = {
  id: 'canonical-hardening-fixtures',
  name: 'Canonical hardening fixtures',
  requirementIds: ['EF-1'],
  command:
    'node console/scripts/validate-hardening-fixtures.mjs console/tests/fixtures/hardening/catalog.json --evidence',
  arguments: [
    'console/scripts/validate-hardening-fixtures.mjs',
    'console/tests/fixtures/hardening/catalog.json',
    '--evidence',
  ],
}
const SOURCE_CHECK = {
  id: 'release-evidence-sources',
  name: 'Release evidence sources',
  requirementIds: ['EF-3'],
  command: 'node scripts/release-verification.mjs',
}
const SOURCE_REGISTRY_PATH = 'release-evidence/sources.json'
const CSP_POLICY_PATH = 'cloudflare/_headers'
const CSP_EVIDENCE_PATH = 'release-evidence/csp-report-only.json'
const CSP_REPORTING_PATHS = ['security/csp-report.ts', 'functions/api/csp-reports.ts']
const CSP_CHECK = {
  id: 'privacy-safe-csp',
  name: 'Privacy-safe Content Security Policy',
  requirementIds: ['OH-1'],
  command: 'node scripts/release-verification.mjs',
}
const CSP_REQUIRED_PATHS = new Set([
  'console',
  'player-view',
  'published-share',
  'authentication',
  'assets',
])
const CSP_EXERCISES = new Set(['script', 'style', 'connection', 'frame', 'resource'])
const REPOSITORIES = [
  { name: 'openfray', path: '.' },
  { name: 'console', path: 'console' },
  { name: 'site', path: 'site' },
  { name: 'handbook', path: 'handbook' },
]
const ENVIRONMENTS = new Set(['local', 'staging', 'production'])
const ENVIRONMENT_POLICIES = {
  local: 'local-only',
  staging: 'authorized-staging-only',
  production: 'separate-written-authorization-required',
}
const APPROVERS = new Set(['pending', 'maintainer'])
const PROVIDER_METHODS = new Set(['automatic', 'mixed', 'manual', 'unavailable'])
const AVAILABILITY = new Set(['available', 'unavailable'])
const DEVICE_CLASSES = new Set(['desktop', 'tablet', 'phone'])
const REPOSITORY_NAMES = new Set(REPOSITORIES.map((repository) => repository.name))
const REQUIRED_INVALIDATORS = [
  'source-commit',
  'lockfile',
  'migration-head',
  'fixture-hashes',
  'baseline-hash',
  'environment-identity',
]
const SAFE_EVIDENCE_TOKEN = /^[a-z0-9][a-z0-9.-]{0,79}$/
const SAFE_RELATIVE_PATH = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/
const PRIVATE_EVIDENCE_WORD =
  /(?:account|authored|capability|credential|password|rejected|secret|token)/
const SHA256 = /^[0-9a-f]{64}$/
const COMMIT = /^[0-9a-f]{40}$/

/** Return a SHA-256 fingerprint for exact bytes or canonical JSON. */
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

/** Return whether a bounded evidence token excludes private-data vocabulary. */
function isSafeFixtureToken(value) {
  return SAFE_EVIDENCE_TOKEN.test(value) && !PRIVATE_EVIDENCE_WORD.test(value)
}

/** Return whether a value is a parsed JSON object. */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Require an object to contain exactly its documented keys. */
function requireKeys(value, keys) {
  if (!isRecord(value)) throw new Error('Invalid evidence source record')
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error('Invalid evidence source fields')
  }
}

/** Require a bounded identifier that excludes private-data vocabulary. */
function requireToken(value) {
  if (
    typeof value !== 'string' ||
    !SAFE_EVIDENCE_TOKEN.test(value) ||
    PRIVATE_EVIDENCE_WORD.test(value)
  ) {
    throw new Error('Invalid evidence source identifier')
  }
  return value
}

/** Require a unique array of bounded identifiers. */
function requireTokenList(value, { allowEmpty = false } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    throw new Error('Invalid evidence source identifiers')
  }
  const tokens = value.map(requireToken)
  if (new Set(tokens).size !== tokens.length)
    throw new Error('Duplicate evidence source identifier')
  return tokens
}

/** Require a repository-relative authority path. */
function requireRelativePath(value) {
  if (
    typeof value !== 'string' ||
    !SAFE_RELATIVE_PATH.test(value) ||
    value.startsWith('/') ||
    value.includes('..') ||
    value.includes('//') ||
    PRIVATE_EVIDENCE_WORD.test(value.toLowerCase())
  ) {
    throw new Error('Invalid evidence authority path')
  }
  return value
}

/** Require availability fields to preserve unavailable evidence explicitly. */
function requireAvailability(availability, unavailableReason) {
  if (!AVAILABILITY.has(availability)) throw new Error('Invalid evidence availability')
  if (availability === 'available' && unavailableReason !== null) {
    throw new Error('Available evidence cannot have an unavailable reason')
  }
  if (availability === 'unavailable') return requireToken(unavailableReason)
  return null
}

/** Decode and validate one logical environment identity. */
function decodeEnvironment(value) {
  requireKeys(value, ['kind', 'identity', 'authority', 'probePolicy'])
  if (!ENVIRONMENTS.has(value.kind)) throw new Error('Invalid environment kind')
  if (value.authority !== 'maintainer') throw new Error('Invalid environment authority')
  if (value.probePolicy !== ENVIRONMENT_POLICIES[value.kind]) {
    throw new Error('Invalid environment probe policy')
  }
  return {
    kind: value.kind,
    identity: requireToken(value.identity),
    authority: value.authority,
    probePolicy: value.probePolicy,
  }
}

/** Decode a provider baseline and fingerprint its validated projection. */
function decodeProviderBaseline(root, value) {
  requireKeys(value, [
    'id',
    'ownerRepository',
    'authority',
    'collectionMethod',
    'unsupportedManualChecks',
    'availability',
    'unavailableReason',
    'freshness',
  ])
  const id = requireToken(value.id)
  if (!REPOSITORY_NAMES.has(value.ownerRepository)) throw new Error('Invalid provider owner')
  requireKeys(value.authority, ['kind', 'path'])
  if (!new Set(['source-file', 'provider-dashboard']).has(value.authority.kind)) {
    throw new Error('Invalid provider authority')
  }
  let authorityPath = null
  let authoritySha256 = null
  if (value.authority.kind === 'source-file') {
    authorityPath = requireRelativePath(value.authority.path)
    const absolute = resolve(root, authorityPath)
    if (!existsSync(absolute)) throw new Error('Missing provider authority')
    authoritySha256 = sha256(readFileSync(absolute))
  } else if (value.authority.path !== null) {
    throw new Error('Dashboard authority cannot carry a path')
  }
  if (!PROVIDER_METHODS.has(value.collectionMethod)) {
    throw new Error('Invalid provider collection method')
  }
  const unsupportedManualChecks = requireTokenList(value.unsupportedManualChecks, {
    allowEmpty: true,
  })
  const unavailableReason = requireAvailability(value.availability, value.unavailableReason)
  requireKeys(value.freshness, ['maximumAgeDays', 'invalidatedBy'])
  if (
    !Number.isInteger(value.freshness.maximumAgeDays) ||
    value.freshness.maximumAgeDays < 1 ||
    value.freshness.maximumAgeDays > 90
  ) {
    throw new Error('Invalid provider freshness')
  }
  const invalidatedBy = requireTokenList(value.freshness.invalidatedBy)
  if (
    invalidatedBy.length !== REQUIRED_INVALIDATORS.length ||
    REQUIRED_INVALIDATORS.some((invalidator) => !invalidatedBy.includes(invalidator))
  ) {
    throw new Error('Incomplete provider freshness invalidators')
  }
  const baseline = {
    id,
    ownerRepository: value.ownerRepository,
    authority: { kind: value.authority.kind, path: authorityPath },
    authoritySha256,
    collectionMethod: value.collectionMethod,
    unsupportedManualChecks,
    availability: value.availability,
    unavailableReason,
    freshness: {
      maximumAgeDays: value.freshness.maximumAgeDays,
      invalidatedBy,
    },
  }
  return { ...baseline, sha256: sha256(JSON.stringify(baseline)) }
}

/** Decode one representative physical-device coverage record. */
function decodeDeviceCoverage(value) {
  requireKeys(value, [
    'id',
    'deviceClass',
    'operatingSystem',
    'browser',
    'assistiveTechnology',
    'inputs',
    'evidenceMethod',
    'availability',
    'unavailableReason',
  ])
  if (!DEVICE_CLASSES.has(value.deviceClass)) throw new Error('Invalid device class')
  if (value.evidenceMethod !== 'physical-manual') throw new Error('Invalid device evidence method')
  const assistiveTechnology =
    value.assistiveTechnology === null ? null : requireToken(value.assistiveTechnology)
  return {
    id: requireToken(value.id),
    deviceClass: value.deviceClass,
    operatingSystem: requireToken(value.operatingSystem),
    browser: requireToken(value.browser),
    assistiveTechnology,
    inputs: requireTokenList(value.inputs),
    evidenceMethod: value.evidenceMethod,
    availability: value.availability,
    unavailableReason: requireAvailability(value.availability, value.unavailableReason),
  }
}

/** Require unique identities from a validated evidence-source collection. */
function requireUniqueIdentities(values, property) {
  const identities = values.map((value) => value[property])
  if (new Set(identities).size !== identities.length) {
    throw new Error('Duplicate evidence source identity')
  }
}

/** Decode the reviewed evidence-source registry without copying rejected values. */
function decodeEvidenceSourceRegistry(root, bytes) {
  const value = JSON.parse(bytes.toString('utf8'))
  requireKeys(value, ['schemaVersion', 'environments', 'providerBaselines', 'deviceCoverage'])
  if (value.schemaVersion !== 1) throw new Error('Unsupported evidence source schema')
  if (!Array.isArray(value.environments) || value.environments.length !== ENVIRONMENTS.size) {
    throw new Error('Incomplete environment registry')
  }
  if (!Array.isArray(value.providerBaselines) || value.providerBaselines.length === 0) {
    throw new Error('Missing provider baselines')
  }
  if (!Array.isArray(value.deviceCoverage) || value.deviceCoverage.length === 0) {
    throw new Error('Missing device coverage')
  }
  const environments = value.environments.map(decodeEnvironment)
  const providerBaselines = value.providerBaselines.map((provider) =>
    decodeProviderBaseline(root, provider),
  )
  const deviceCoverage = value.deviceCoverage.map(decodeDeviceCoverage)
  requireUniqueIdentities(environments, 'kind')
  requireUniqueIdentities(environments, 'identity')
  requireUniqueIdentities(providerBaselines, 'id')
  requireUniqueIdentities(deviceCoverage, 'id')
  if ([...ENVIRONMENTS].some((kind) => !environments.some((entry) => entry.kind === kind))) {
    throw new Error('Missing environment kind')
  }
  return {
    registry: { path: SOURCE_REGISTRY_PATH, sha256: sha256(bytes) },
    environments,
    providerBaselines,
    deviceCoverage,
  }
}

/** Validate the reviewed evidence sources and select the requested environment identity. */
function runEvidenceSourceCheck(root, environmentKind) {
  const startedAt = new Date().toISOString()
  const path = resolve(root, SOURCE_REGISTRY_PATH)
  let result = 'missing'
  let evidence = null
  if (existsSync(path)) {
    try {
      evidence = decodeEvidenceSourceRegistry(root, readFileSync(path))
      result = 'passed'
    } catch {
      result = 'failed'
    }
  }
  return {
    check: {
      id: SOURCE_CHECK.id,
      name: SOURCE_CHECK.name,
      requirementIds: SOURCE_CHECK.requirementIds,
      applicable: true,
      command: SOURCE_CHECK.command,
      result,
      exitCode: null,
      startedAt,
      completedAt: new Date().toISOString(),
    },
    registry: evidence?.registry ?? null,
    environment: evidence?.environments.find((entry) => entry.kind === environmentKind) ?? null,
    providerBaselines: evidence?.providerBaselines ?? [],
    deviceCoverage: evidence?.deviceCoverage ?? [],
  }
}

/** Validate the report-only CSP record against the exact enforced configuration. */
function decodeCspEvidence(policyBytes, evidenceBytes, reportingConfiguration) {
  const value = JSON.parse(evidenceBytes.toString('utf8'))
  requireKeys(value, [
    'schemaVersion',
    'policySha256',
    'result',
    'requiredPaths',
    'exercises',
    'unexplainedViolations',
  ])
  if (
    value.schemaVersion !== 1 ||
    value.policySha256 !== sha256(policyBytes) ||
    value.result !== 'passed' ||
    value.unexplainedViolations !== 0
  ) {
    throw new Error('Invalid CSP report-only evidence')
  }
  const requiredPaths = requireTokenList(value.requiredPaths)
  const exercises = requireTokenList(value.exercises)
  if (
    requiredPaths.length !== CSP_REQUIRED_PATHS.size ||
    requiredPaths.some((path) => !CSP_REQUIRED_PATHS.has(path)) ||
    exercises.length !== CSP_EXERCISES.size ||
    exercises.some((exercise) => !CSP_EXERCISES.has(exercise))
  ) {
    throw new Error('Incomplete CSP report-only evidence')
  }
  const policy = policyBytes.toString('utf8')
  if (
    !policy.includes('Content-Security-Policy:') ||
    policy.includes('Content-Security-Policy-Report-Only:') ||
    !policy.includes('report-uri /api/csp-reports')
  ) {
    throw new Error('CSP is not safely enforced')
  }
  return {
    configuration: { path: CSP_POLICY_PATH, sha256: sha256(policyBytes) },
    reportOnlyEvidence: { path: CSP_EVIDENCE_PATH, sha256: sha256(evidenceBytes) },
    reportingConfiguration,
  }
}

/** Check that enforcement matches complete report-only and staged-exercise evidence. */
function runCspCheck(root) {
  const startedAt = new Date().toISOString()
  const policyPath = resolve(root, CSP_POLICY_PATH)
  const evidencePath = resolve(root, CSP_EVIDENCE_PATH)
  let result = 'missing'
  let evidence = null
  const reportingAvailable = CSP_REPORTING_PATHS.every((path) => existsSync(resolve(root, path)))
  if (existsSync(policyPath) && existsSync(evidencePath) && reportingAvailable) {
    try {
      const reportingConfiguration = CSP_REPORTING_PATHS.map((path) => ({
        path,
        sha256: sha256(readFileSync(resolve(root, path))),
      }))
      evidence = decodeCspEvidence(
        readFileSync(policyPath),
        readFileSync(evidencePath),
        reportingConfiguration,
      )
      result = 'passed'
    } catch {
      result = 'failed'
    }
  }
  return {
    check: {
      id: CSP_CHECK.id,
      name: CSP_CHECK.name,
      requirementIds: CSP_CHECK.requirementIds,
      applicable: true,
      command: CSP_CHECK.command,
      result,
      exitCode: null,
      startedAt,
      completedAt: new Date().toISOString(),
    },
    configuration: evidence?.configuration ?? null,
    reportOnlyEvidence: evidence?.reportOnlyEvidence ?? null,
    reportingConfiguration: evidence?.reportingConfiguration ?? [],
  }
}

/** Decode the console-owned fixture projection without copying rejected values. */
function decodeFixtureEvidence(serialized) {
  try {
    const evidence = JSON.parse(serialized)
    if (!Array.isArray(evidence?.fixtures) || evidence.fixtures.length === 0) return null
    const fixtures = evidence.fixtures.map((fixture) => {
      if (
        !isSafeFixtureToken(fixture?.id ?? '') ||
        !isSafeFixtureToken(fixture?.fixtureClass ?? '') ||
        !SHA256.test(fixture?.sha256 ?? '')
      ) {
        throw new Error('Unsafe fixture evidence')
      }
      return {
        id: fixture.id,
        fixtureClass: fixture.fixtureClass,
        sha256: fixture.sha256,
      }
    })
    return fixtures
  } catch {
    return null
  }
}

/** Run the selected fixture check without copying its rejected output into evidence. */
function runFixtureCheck(root) {
  const startedAt = new Date().toISOString()
  const commandAvailable = existsSync(resolve(root, FIXTURE_CHECK.arguments[0]))
  let result = 'missing'
  let exitCode = null
  let fixtures = []
  if (commandAvailable) {
    const execution = spawnSync(process.execPath, FIXTURE_CHECK.arguments, {
      cwd: root,
      encoding: 'utf8',
      stdio: 'pipe',
    })
    exitCode = Number.isInteger(execution.status) ? execution.status : null
    const decoded = execution.status === 0 ? decodeFixtureEvidence(execution.stdout) : null
    result = execution.status === 0 && decoded !== null ? 'passed' : 'failed'
    fixtures = decoded ?? []
  }
  return {
    check: {
      id: FIXTURE_CHECK.id,
      name: FIXTURE_CHECK.name,
      requirementIds: FIXTURE_CHECK.requirementIds,
      applicable: true,
      command: FIXTURE_CHECK.command,
      result,
      exitCode,
      startedAt,
      completedAt: new Date().toISOString(),
    },
    fixtures,
  }
}

/** Return whether a production rollback target resolves to an immutable commit. */
function rollbackTargetReady(root, environment, rollbackTarget) {
  if (environment !== 'production') return true
  if (rollbackTarget === null) return false
  const result = spawnSync('git', ['cat-file', '-e', `${rollbackTarget}^{commit}`], { cwd: root })
  return result.status === 0
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
    `- **Environment:** ${manifest.environment.identity ?? 'Missing'} (${displayStatus(manifest.environment.kind)})`,
    `- **Probe policy:** ${manifest.environment.probePolicy ?? 'Missing'}`,
    `- **Generated:** ${displayTimestamp(manifest.generatedAt)}`,
    `- **Approver:** ${displayStatus(manifest.approver)}`,
    `- **Rollback target:** ${manifest.rollbackTarget ?? (manifest.environment.kind === 'production' ? 'Missing' : 'Not applicable')}`,
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
    '### Evidence source registry',
    '',
    '| Path | SHA-256 |',
    '| --- | --- |',
    manifest.inputs.evidenceSourceRegistry === null
      ? `| ${SOURCE_REGISTRY_PATH} | Missing |`
      : `| ${manifest.inputs.evidenceSourceRegistry.path} | ${manifest.inputs.evidenceSourceRegistry.sha256} |`,
    '',
    '### Content Security Policy',
    '',
    '| Input | Path | SHA-256 |',
    '| --- | --- | --- |',
    manifest.inputs.contentSecurityPolicy === null
      ? `| Enforced configuration | ${CSP_POLICY_PATH} | Missing |`
      : `| Enforced configuration | ${manifest.inputs.contentSecurityPolicy.path} | ${manifest.inputs.contentSecurityPolicy.sha256} |`,
    manifest.inputs.cspReportOnlyEvidence === null
      ? `| Report-only evidence | ${CSP_EVIDENCE_PATH} | Missing |`
      : `| Report-only evidence | ${manifest.inputs.cspReportOnlyEvidence.path} | ${manifest.inputs.cspReportOnlyEvidence.sha256} |`,
  )
  if (manifest.inputs.cspReportingConfiguration.length === 0) {
    lines.push('| Reporting boundary | Missing | Missing |')
  }
  for (const source of manifest.inputs.cspReportingConfiguration) {
    lines.push(`| Reporting boundary | ${source.path} | ${source.sha256} |`)
  }
  lines.push(
    '',
    '### Provider baselines',
    '',
    '| Provider | Authority | Collection | Availability | Baseline SHA-256 |',
    '| --- | --- | --- | --- | --- |',
  )
  if (manifest.inputs.providerBaselines.length === 0) {
    lines.push('| Missing | Missing | Missing | Missing | Missing |')
  }
  for (const provider of manifest.inputs.providerBaselines) {
    lines.push(
      `| ${provider.id} | ${provider.authority.kind} | ${provider.collectionMethod} | ${displayStatus(provider.availability)} | ${provider.sha256} |`,
    )
  }
  lines.push(
    '',
    '### Physical-device coverage',
    '',
    '| Combination | Browser | Assistive technology | Availability |',
    '| --- | --- | --- | --- |',
  )
  if (manifest.inputs.deviceCoverage.length === 0) {
    lines.push('| Missing | Missing | Missing | Missing |')
  }
  for (const device of manifest.inputs.deviceCoverage) {
    lines.push(
      `| ${device.id} | ${device.browser} | ${device.assistiveTechnology ?? 'None'} | ${displayStatus(device.availability)} |`,
    )
  }
  lines.push(
    '',
    'Registry availability records access only. It does not count as provider or physical-device test evidence.',
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
export function verifyRelease(options = {}) {
  const settings = {
    root: process.cwd(),
    output: '.artifacts/release-verification',
    environment: 'local',
    approver: 'pending',
    rollbackTarget: null,
    ...options,
  }
  const repositories = repositoryEvidence(settings.root)
  const lockfiles = lockfileEvidence(settings.root)
  const fixtureCheck = runFixtureCheck(settings.root)
  const sourceCheck = runEvidenceSourceCheck(settings.root, settings.environment)
  const cspCheck = runCspCheck(settings.root)
  const workingTreeClean = isCleanWorkspace(settings.root)
  const rollbackReady = rollbackTargetReady(
    settings.root,
    settings.environment,
    settings.rollbackTarget,
  )
  const inputsComplete =
    repositories.every((repository) => repository.commit !== null) &&
    lockfiles.length > 0 &&
    fixtureCheck.fixtures.length > 0 &&
    sourceCheck.registry !== null &&
    sourceCheck.environment !== null &&
    sourceCheck.providerBaselines.length > 0 &&
    sourceCheck.deviceCoverage.length > 0 &&
    cspCheck.configuration !== null &&
    cspCheck.reportOnlyEvidence !== null &&
    cspCheck.reportingConfiguration.length === CSP_REPORTING_PATHS.length &&
    workingTreeClean &&
    rollbackReady
  const checks = [fixtureCheck.check, sourceCheck.check, cspCheck.check]
  const passed = inputsComplete && checks.every((check) => check.result === 'passed')
  const manifest = {
    schemaVersion: 1,
    releaseClass: 'advisory',
    result: passed ? 'passed' : 'failed',
    generatedAt: new Date().toISOString(),
    approver: settings.approver,
    rollbackTarget: settings.rollbackTarget,
    environment: {
      kind: settings.environment,
      identity: sourceCheck.environment?.identity ?? null,
      authority: sourceCheck.environment?.authority ?? null,
      probePolicy: sourceCheck.environment?.probePolicy ?? null,
      runtime: {
        node: process.version,
        platform: process.platform,
        architecture: process.arch,
      },
    },
    inputs: {
      repositories,
      lockfiles,
      fixtures: fixtureCheck.fixtures,
      evidenceSourceRegistry: sourceCheck.registry,
      contentSecurityPolicy: cspCheck.configuration,
      cspReportOnlyEvidence: cspCheck.reportOnlyEvidence,
      cspReportingConfiguration: cspCheck.reportingConfiguration,
      providerBaselines: sourceCheck.providerBaselines,
      deviceCoverage: sourceCheck.deviceCoverage,
      workingTreeClean,
      rollbackReady,
    },
    checks,
  }
  const output = resolve(settings.root, settings.output)
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
