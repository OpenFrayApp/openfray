// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  PROMOTION_BOUNDARIES,
  SAFE_PROMOTION_IDENTITY,
  optionPairs,
} from './promotion-contract.mjs'

const REPOSITORIES = ['openfray', 'console', 'site', 'handbook']
const COMMIT = /^[0-9a-f]{40}$/
const MAX_ATTESTATION_AGE_MS = 7 * 24 * 60 * 60 * 1000
const CONFIGURATION_PATHS = [
  { repository: 'openfray', path: 'package-lock.json' },
  { repository: 'openfray', path: 'cloudflare/_headers' },
  { repository: 'console', path: 'supabase/config.toml' },
  { repository: 'console', path: 'supabase/hosted-config.expected.json' },
]
const CRITICAL_PATHS = [
  {
    boundary: 'authentication',
    pattern:
      /^(src\/auth\/|src\/lib\/supabase\.ts|supabase\/config\.toml|supabase\/hosted-config\.expected\.json)/,
  },
  {
    boundary: 'row-level-security',
    pattern:
      /^(\.github\/workflows\/database-authority\.yml|scripts\/lib\/database-boundary\.mjs|scripts\/verify-(?:database|staging)-boundary-evidence\.mjs|supabase\/(?:config\.toml|hosted-config\.expected\.json|tests\/database-boundary\.sql)|tests\/(?:database|scripts\/databaseBoundary))/,
  },
  {
    boundary: 'sharing',
    pattern:
      /^(src\/(?:SharedRoute\.tsx|combat\/playerView\.ts|components\/(?:player|share)\/|lib\/supabase\.ts|state\/(?:playerChannel|playerCode|playerProtocol|shareCode|shares)\.)|tests\/(?:components\/(?:player|share)\/|state\/(?:playerChannel|playerCode|playerProtocol|shareCode|shares)\.))/,
  },
]
const ROOT_CRITICAL_PATHS = [
  {
    boundary: 'sharing',
    pattern:
      /^(\.github\/workflows\/(?:production-promotion|staging-candidate)\.yml|cloudflare\/_headers|functions\/s\/|share-card\/|public-boundary\/|rate-limit-worker\/|report-boundary\/|functions\/api\/(?:csp-reports|reports)\.ts|scripts\/(?:environment-approval|production-(?:deployment-record|promotion)|promotion-contract|staging-attestation)\.mjs|security\/)/,
  },
]

/** Return a SHA-256 fingerprint for exact bytes. */
function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

/** Run Git and return trimmed output. */
function git(root, arguments_) {
  return execFileSync('git', arguments_, { cwd: root, encoding: 'utf8' }).trim()
}

/** Parse the fixed production-promotion command-line interface. */
function parseOptions(arguments_) {
  const options = {
    output: '.artifacts/production-promotion',
    rollbackTarget: null,
    approver: null,
    productionEnvironment: null,
    stagingEnvironment: null,
    stagingAttestation: null,
  }
  for (const [option, value] of optionPairs(arguments_)) {
    if (option === '--output') options.output = value
    else if (option === '--rollback-target' && COMMIT.test(value)) options.rollbackTarget = value
    else if (option === '--approver' && SAFE_PROMOTION_IDENTITY.test(value)) {
      options.approver = value
    } else if (option === '--production-environment' && SAFE_PROMOTION_IDENTITY.test(value)) {
      options.productionEnvironment = value
    } else if (option === '--staging-environment' && SAFE_PROMOTION_IDENTITY.test(value)) {
      options.stagingEnvironment = value
    } else if (option === '--staging-attestation') options.stagingAttestation = value
    else throw new Error(`Unsupported production-promotion option: ${option}`)
  }
  return options
}

/** Resolve a commit and reject missing or non-commit rollback targets. */
function resolveCommit(root, value) {
  if (!value) return null
  const result = spawnSync('git', ['rev-parse', '--verify', `${value}^{commit}`], {
    cwd: root,
    encoding: 'utf8',
  })
  const commit = result.status === 0 ? result.stdout.trim() : ''
  return COMMIT.test(commit) ? commit : null
}

/** Return the submodule commit recorded by one root commit. */
function recordedSubmoduleCommit(root, rootCommit, path) {
  const line = git(root, ['ls-tree', rootCommit, '--', path])
  const commit = line.split(/\s+/)[2] ?? ''
  return COMMIT.test(commit) ? commit : null
}

/** Capture the coordinated commits represented by a root commit. */
function coordinatedCommits(root, rootCommit, fromWorkingTree) {
  return REPOSITORIES.map((name) => ({
    name,
    commit:
      name === 'openfray'
        ? rootCommit
        : fromWorkingTree
          ? git(resolve(root, name), ['rev-parse', 'HEAD'])
          : recordedSubmoduleCommit(root, rootCommit, name),
  }))
}

/** Read exact file bytes from the candidate workspace or rollback commit. */
function configurationBytes(root, entry, rootCommit, commits, fromWorkingTree) {
  if (fromWorkingTree) {
    const path = resolve(root, entry.repository === 'openfray' ? '.' : entry.repository, entry.path)
    return existsSync(path) ? readFileSync(path) : null
  }
  const repositoryCommit = commits.find(({ name }) => name === entry.repository)?.commit
  if (!repositoryCommit) return null
  const repositoryRoot = resolve(root, entry.repository === 'openfray' ? '.' : entry.repository)
  const result = spawnSync('git', ['show', `${repositoryCommit}:${entry.path}`], {
    cwd: repositoryRoot,
    encoding: null,
  })
  return result.status === 0 ? result.stdout : null
}

/** Fingerprint deployment configuration at one coordinated candidate. */
function configurationEvidence(root, rootCommit, commits, fromWorkingTree) {
  return CONFIGURATION_PATHS.map((entry) => {
    const bytes = configurationBytes(root, entry, rootCommit, commits, fromWorkingTree)
    return {
      repository: entry.repository,
      path: entry.path,
      sha256: bytes === null ? null : sha256(bytes),
    }
  })
}

/** Return the newest migration version represented by one console commit. */
function migrationHead(root, consoleCommit, fromWorkingTree) {
  let paths
  if (fromWorkingTree) {
    const directory = resolve(root, 'console/supabase/migrations')
    paths = existsSync(directory)
      ? readdirSync(directory).map((name) => `supabase/migrations/${name}`)
      : []
  } else {
    const output = git(resolve(root, 'console'), [
      'ls-tree',
      '-r',
      '--name-only',
      consoleCommit,
      '--',
      'supabase/migrations',
    ])
    paths = output ? output.split('\n') : []
  }
  const versions = paths
    .map(
      (path) =>
        path
          .split('/')
          .at(-1)
          ?.match(/^(\d{14})_/)?.[1],
    )
    .filter(Boolean)
    .sort()
  return versions.at(-1) ?? null
}

/** List changed paths between two commits in one repository. */
function changedPaths(root, before, after) {
  const output = git(root, ['diff', '--name-only', before, after, '--'])
  return output ? output.split('\n') : []
}

/** Select release-critical boundaries from root and console changes. */
function applicableBoundaries(root, rollback, candidate) {
  const boundaries = new Set()
  for (const path of changedPaths(root, rollback.rootCommit, candidate.rootCommit)) {
    for (const rule of ROOT_CRITICAL_PATHS)
      if (rule.pattern.test(path)) boundaries.add(rule.boundary)
  }
  for (const path of changedPaths(
    resolve(root, 'console'),
    rollback.consoleCommit,
    candidate.consoleCommit,
  )) {
    if (path.startsWith('supabase/migrations/')) {
      boundaries.add('migration')
      boundaries.add('row-level-security')
      boundaries.add('backup')
    }
    for (const rule of CRITICAL_PATHS) if (rule.pattern.test(path)) boundaries.add(rule.boundary)
  }
  return PROMOTION_BOUNDARIES.filter((value) => boundaries.has(value))
}

/** Return whether one commit is a strict ancestor of another. */
function isStrictAncestor(root, before, after) {
  return (
    before !== after &&
    spawnSync('git', ['merge-base', '--is-ancestor', before, after], { cwd: root }).status === 0
  )
}

/** Return whether tracked workspace bytes match the candidate commits. */
function trackedWorkspaceClean(root) {
  return (
    spawnSync('git', ['diff', '--quiet', 'HEAD', '--'], { cwd: root }).status === 0 &&
    spawnSync('git', ['diff', '--cached', '--quiet', 'HEAD', '--'], { cwd: root }).status === 0 &&
    REPOSITORIES.slice(1).every(
      (name) =>
        spawnSync('git', ['diff', '--quiet', 'HEAD', '--'], { cwd: resolve(root, name) }).status ===
        0,
    )
  )
}

/** Compare JSON-compatible evidence projections exactly. */
function sameEvidence(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

/** Return whether an attestation timestamp is current and well formed. */
function freshTimestamp(value, now = Date.now()) {
  if (typeof value !== 'string') return false
  const timestamp = Date.parse(value)
  return (
    Number.isFinite(timestamp) &&
    timestamp <= now + 5 * 60 * 1000 &&
    now - timestamp <= MAX_ATTESTATION_AGE_MS
  )
}

/** Validate staging evidence against the exact candidate and rollback projections. */
function verifyStagingAttestation(value, expected) {
  const checksMatch =
    value?.checks?.build === 'passed' &&
    PROMOTION_BOUNDARIES.every(
      (name) =>
        value?.checks?.[name] ===
        (expected.boundaries.includes(name) ? 'passed' : 'not-applicable'),
    )
  const valid =
    value?.schemaVersion === 1 &&
    value?.environment?.kind === 'staging' &&
    value?.environment?.identity === expected.stagingEnvironment &&
    sameEvidence(value?.candidate?.repositories, expected.candidate.repositories) &&
    value?.candidate?.migrationHead === expected.candidate.migrationHead &&
    sameEvidence(value?.candidate?.configuration, expected.candidate.configuration) &&
    checksMatch &&
    SAFE_PROMOTION_IDENTITY.test(value?.approvedBy ?? '') &&
    freshTimestamp(value?.recordedAt) &&
    sameEvidence(value?.rollback?.repositories, expected.rollback.repositories) &&
    value?.rollback?.migrationHead === expected.rollback.migrationHead &&
    value?.rollback?.result === 'passed' &&
    freshTimestamp(value?.rollback?.exercisedAt)
  if (!valid) return { result: 'rejected' }
  return {
    result: 'passed',
    environmentIdentity: value.environment.identity,
    approvedBy: value.approvedBy,
    recordedAt: value.recordedAt,
    sha256: expected.sha256,
  }
}

/** Verify one production candidate and write its immutable release record. */
export function verifyProductionPromotion(options = {}) {
  const settings = { root: process.cwd(), ...options }
  const candidateRoot = resolveCommit(settings.root, 'HEAD')
  const rollbackRoot = resolveCommit(settings.root, settings.rollbackTarget)
  const failureReasons = []
  if (!candidateRoot) failureReasons.push('candidate-commit-missing')
  if (!rollbackRoot) failureReasons.push('rollback-target-invalid')
  if (!settings.approver) failureReasons.push('approver-missing')
  if (!settings.productionEnvironment) failureReasons.push('production-environment-missing')

  const candidateRepositories = candidateRoot
    ? coordinatedCommits(settings.root, candidateRoot, true)
    : []
  const rollbackRepositories = rollbackRoot
    ? coordinatedCommits(settings.root, rollbackRoot, false)
    : []
  const commitsComplete = [...candidateRepositories, ...rollbackRepositories].every(({ commit }) =>
    COMMIT.test(commit ?? ''),
  )
  if (!commitsComplete) failureReasons.push('coordinated-commits-incomplete')
  if (!trackedWorkspaceClean(settings.root)) failureReasons.push('tracked-workspace-dirty')

  const candidateConsole = candidateRepositories.find(({ name }) => name === 'console')?.commit
  const rollbackConsole = rollbackRepositories.find(({ name }) => name === 'console')?.commit
  const rollbackCoherent =
    candidateRoot !== null &&
    rollbackRoot !== null &&
    commitsComplete &&
    isStrictAncestor(settings.root, rollbackRoot, candidateRoot) &&
    REPOSITORIES.slice(1).every((name) => {
      const candidate = candidateRepositories.find((entry) => entry.name === name)?.commit
      const rollback = rollbackRepositories.find((entry) => entry.name === name)?.commit
      return (
        candidate === rollback ||
        isStrictAncestor(resolve(settings.root, name), rollback, candidate)
      )
    })
  if (!rollbackCoherent) failureReasons.push('rollback-target-incoherent')
  const boundaries =
    candidateRoot && rollbackRoot && candidateConsole && rollbackConsole
      ? applicableBoundaries(
          settings.root,
          { rootCommit: rollbackRoot, consoleCommit: rollbackConsole },
          { rootCommit: candidateRoot, consoleCommit: candidateConsole },
        )
      : []
  const candidate = {
    rootCommit: candidateRoot,
    repositories: candidateRepositories,
    migrationHead: candidateConsole ? migrationHead(settings.root, candidateConsole, true) : null,
    configuration: candidateRoot
      ? configurationEvidence(settings.root, candidateRoot, candidateRepositories, true)
      : [],
  }
  const rollback = {
    rootCommit: rollbackRoot,
    repositories: rollbackRepositories,
    migrationHead: rollbackConsole ? migrationHead(settings.root, rollbackConsole, false) : null,
    coherent: rollbackCoherent,
  }

  let stagingEvidence = null
  if (boundaries.length > 0) {
    if (!settings.stagingAttestation || !settings.stagingEnvironment) {
      failureReasons.push('staging-evidence-missing')
    } else {
      try {
        const bytes = readFileSync(resolve(settings.root, settings.stagingAttestation))
        stagingEvidence = verifyStagingAttestation(JSON.parse(bytes.toString('utf8')), {
          boundaries,
          candidate,
          rollback,
          stagingEnvironment: settings.stagingEnvironment,
          sha256: sha256(bytes),
        })
        if (stagingEvidence.result !== 'passed') failureReasons.push('staging-evidence-rejected')
      } catch {
        stagingEvidence = { result: 'rejected' }
        failureReasons.push('staging-evidence-rejected')
      }
    }
  }

  const manifest = {
    schemaVersion: 1,
    releaseClass: boundaries.length > 0 ? 'critical' : 'ordinary',
    result: failureReasons.length === 0 ? 'passed' : 'failed',
    environment: { kind: 'production', identity: settings.productionEnvironment },
    approver: settings.approver,
    recordedAt: new Date().toISOString(),
    promotedAt: null,
    deployment: { result: 'pending', completedAt: null },
    applicableBoundaries: boundaries,
    candidate,
    rollback,
    stagingEvidence,
    failureReasons,
  }
  const output = resolve(settings.root, settings.output)
  mkdirSync(output, { recursive: true })
  writeFileSync(resolve(output, 'release-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  return manifest
}

/** Parse CLI options, run the gate, and block an ineligible promotion. */
function main() {
  const options = parseOptions(process.argv.slice(2))
  const manifest = verifyProductionPromotion(options)
  console.log(`Production promotion ${manifest.result}.`)
  if (manifest.result !== 'passed') process.exitCode = 1
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
