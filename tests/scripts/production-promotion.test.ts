// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const SCRIPT = resolve(__dirname, '../../scripts/production-promotion.mjs')
const DEPLOYMENT_RECORD_SCRIPT = resolve(
  __dirname,
  '../../scripts/production-deployment-record.mjs',
)
const ENVIRONMENT_APPROVAL_SCRIPT = resolve(__dirname, '../../scripts/environment-approval.mjs')
const ATTESTATION_SCRIPT = resolve(__dirname, '../../scripts/staging-attestation.mjs')
const roots: string[] = []

/** Write one fixture file and create its parent directories. */
function writeFixture(root: string, path: string, content: string): void {
  const absolute = join(root, path)
  mkdirSync(dirname(absolute), { recursive: true })
  writeFileSync(absolute, content)
}

/** Commit every current change and return the immutable commit identity. */
function commit(root: string, message: string): string {
  execFileSync('git', ['add', '.'], { cwd: root })
  execFileSync('git', ['commit', '-q', '-m', message], { cwd: root })
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
}

/** Initialize a repository with a deterministic test identity. */
function initializeRepository(root: string): void {
  execFileSync('git', ['init', '-q'], { cwd: root })
  execFileSync('git', ['config', 'user.email', 'promotion-test@invalid.example'], { cwd: root })
  execFileSync('git', ['config', 'user.name', 'Promotion test'], { cwd: root })
  execFileSync('git', ['config', 'advice.addEmbeddedRepo', 'false'], { cwd: root })
}

/** Build a coordinated workspace with one rollback commit and one candidate commit. */
function createWorkspace(change: 'ordinary' | 'authentication' | 'migration'): {
  root: string
  rollbackTarget: string
} {
  const root = mkdtempSync(join(tmpdir(), 'production-promotion-'))
  roots.push(root)

  for (const repository of ['console', 'site', 'handbook']) {
    mkdirSync(join(root, repository), { recursive: true })
    initializeRepository(join(root, repository))
    writeFixture(root, `${repository}/README.md`, `${repository}\n`)
  }
  writeFixture(root, 'console/supabase/migrations/20260901000000_core.sql', 'select 1;\n')
  writeFixture(root, 'console/supabase/config.toml', 'project_id = "openfray"\n')
  writeFixture(root, 'console/supabase/hosted-config.expected.json', '{"version":1}\n')
  writeFixture(root, 'console/src/auth/AuthProvider.tsx', 'export const provider = true\n')
  writeFixture(root, 'site/src/pages/index.astro', '<h1>OpenFray</h1>\n')
  for (const repository of ['console', 'site', 'handbook']) commit(join(root, repository), 'Base')

  initializeRepository(root)
  writeFixture(root, 'package-lock.json', '{"lockfileVersion":3}\n')
  writeFixture(root, 'cloudflare/_headers', '/*\n  X-Content-Type-Options: nosniff\n')
  const rollbackTarget = commit(root, 'Rollback target')

  if (change === 'ordinary') {
    writeFixture(root, 'site/src/pages/index.astro', '<h1>OpenFray today</h1>\n')
    commit(join(root, 'site'), 'Ordinary content')
  } else if (change === 'authentication') {
    writeFixture(root, 'console/src/auth/AuthProvider.tsx', 'export const provider = "changed"\n')
    commit(join(root, 'console'), 'Authentication change')
  } else {
    writeFixture(root, 'console/supabase/migrations/20260902000000_accounts.sql', 'select 2;\n')
    commit(join(root, 'console'), 'Migration change')
  }
  commit(root, 'Production candidate')
  return { root, rollbackTarget }
}

/** Run the promotion verifier and read the release manifest it always writes. */
function runPromotion(
  root: string,
  rollbackTarget: string,
  stagingAttestation?: Record<string, unknown>,
) {
  const output = mkdtempSync(join(tmpdir(), 'production-manifest-'))
  roots.push(output)
  const arguments_ = [
    SCRIPT,
    '--output',
    output,
    '--rollback-target',
    rollbackTarget,
    '--approver',
    'release-maintainer',
    '--production-environment',
    'openfray-production',
    '--staging-environment',
    'openfray-staging',
  ]
  if (stagingAttestation) {
    const path = join(root, 'staging-attestation.json')
    writeFileSync(path, `${JSON.stringify(stagingAttestation)}\n`)
    arguments_.push('--staging-attestation', path)
  }
  const result = spawnSync(process.execPath, arguments_, { cwd: root, encoding: 'utf8' })
  const manifestPath = join(output, 'release-manifest.json')
  return {
    result,
    manifestPath,
    manifest: JSON.parse(readFileSync(manifestPath, 'utf8')),
  }
}

/** Build matching staging evidence from a failed critical-gate manifest. */
function matchingAttestation(manifest: Record<string, any>): Record<string, unknown> {
  const checks = Object.fromEntries(
    ['migration', 'authentication', 'row-level-security', 'sharing', 'backup'].map((boundary) => [
      boundary,
      manifest.applicableBoundaries.includes(boundary) ? 'passed' : 'not-applicable',
    ]),
  )
  return {
    schemaVersion: 1,
    environment: { kind: 'staging', identity: 'openfray-staging' },
    candidate: {
      repositories: manifest.candidate.repositories,
      migrationHead: manifest.candidate.migrationHead,
      configuration: manifest.candidate.configuration,
    },
    checks: { build: 'passed', ...checks },
    approvedBy: 'staging-maintainer',
    recordedAt: new Date().toISOString(),
    rollback: {
      repositories: manifest.rollback.repositories,
      migrationHead: manifest.rollback.migrationHead,
      result: 'passed',
      exercisedAt: new Date().toISOString(),
    },
  }
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('production promotion', () => {
  it('records the actual reviewer for the selected protected environment', () => {
    const reviews = [
      {
        environments: [{ name: 'production' }],
        state: 'approved',
        user: { login: 'release-reviewer' },
      },
    ]
    const result = spawnSync(process.execPath, [ENVIRONMENT_APPROVAL_SCRIPT, 'production'], {
      input: JSON.stringify(reviews),
      encoding: 'utf8',
    })

    expect(result.status).toBe(0)
    expect(result.stdout.trim()).toBe('PROMOTION_APPROVER=release-reviewer')
  })

  it('allows an ordinary release without staging matrices', () => {
    const { root, rollbackTarget } = createWorkspace('ordinary')
    const { manifest, result } = runPromotion(root, rollbackTarget)

    expect(result.status).toBe(0)
    expect(manifest).toMatchObject({
      schemaVersion: 1,
      releaseClass: 'ordinary',
      result: 'passed',
      approver: 'release-maintainer',
      stagingEvidence: null,
      applicableBoundaries: [],
    })
    expect(manifest.candidate.repositories).toHaveLength(4)
    expect(manifest.rollback).toMatchObject({ rootCommit: rollbackTarget, coherent: true })
    expect(JSON.stringify(manifest)).not.toContain('providerBaselines')
    expect(JSON.stringify(manifest)).not.toContain('deviceCoverage')
  })

  it('records the deployment result and promotion timestamp after the gate', () => {
    const { root, rollbackTarget } = createWorkspace('ordinary')
    const promotion = runPromotion(root, rollbackTarget)
    const result = spawnSync(
      process.execPath,
      [DEPLOYMENT_RECORD_SCRIPT, '--manifest', promotion.manifestPath, '--result', 'passed'],
      { cwd: root, encoding: 'utf8' },
    )
    const manifest = JSON.parse(readFileSync(promotion.manifestPath, 'utf8'))

    expect(result.status).toBe(0)
    expect(manifest.deployment).toMatchObject({ result: 'passed' })
    expect(manifest.promotedAt).toMatch(/Z$/)
  })

  it('rejects a rollback target that is not a prior coordinated candidate', () => {
    const { root } = createWorkspace('ordinary')
    const candidate = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim()
    const { manifest, result } = runPromotion(root, candidate)

    expect(result.status).toBe(1)
    expect(manifest.rollback.coherent).toBe(false)
    expect(manifest.failureReasons).toContain('rollback-target-incoherent')
  })

  it.each([
    ['authentication', ['authentication']],
    ['migration', ['migration', 'row-level-security', 'backup']],
  ] as const)('blocks a critical %s release without staging evidence', (change, boundaries) => {
    const { root, rollbackTarget } = createWorkspace(change)
    const { manifest, result } = runPromotion(root, rollbackTarget)

    expect(result.status).toBe(1)
    expect(manifest.releaseClass).toBe('critical')
    expect(manifest.result).toBe('failed')
    expect(manifest.applicableBoundaries).toEqual(boundaries)
    expect(manifest.stagingEvidence).toBeNull()
  })

  it('accepts reviewed staging evidence for the exact coordinated candidate', () => {
    const { root, rollbackTarget } = createWorkspace('authentication')
    const failed = runPromotion(root, rollbackTarget).manifest
    const { manifest, result } = runPromotion(root, rollbackTarget, matchingAttestation(failed))

    expect(result.status).toBe(0)
    expect(manifest.result).toBe('passed')
    expect(manifest.stagingEvidence).toMatchObject({
      result: 'passed',
      environmentIdentity: 'openfray-staging',
      approvedBy: 'staging-maintainer',
    })
  })

  it('accepts the attestation emitted by the staging workflow command', () => {
    const { root, rollbackTarget } = createWorkspace('authentication')
    const path = join(root, 'generated-attestation.json')
    const result = spawnSync(
      process.execPath,
      [
        ATTESTATION_SCRIPT,
        '--output',
        path,
        '--rollback-target',
        rollbackTarget,
        '--environment',
        'openfray-staging',
        '--approver',
        'staging-maintainer',
        '--migration',
        'not-applicable',
        '--authentication',
        'passed',
        '--row-level-security',
        'not-applicable',
        '--sharing',
        'not-applicable',
        '--backup',
        'not-applicable',
        '--rollback-exercise',
        'passed',
      ],
      { cwd: root, encoding: 'utf8' },
    )
    const attestation = JSON.parse(readFileSync(path, 'utf8'))
    const promotion = runPromotion(root, rollbackTarget, attestation)

    expect(result.status).toBe(0)
    expect(promotion.result.status).toBe(0)
    expect(promotion.manifest.stagingEvidence.result).toBe('passed')
  })

  it.each(['commits', 'environment', 'migration head', 'freshness'])(
    'rejects staging evidence with mismatched %s',
    (mismatch) => {
      const { root, rollbackTarget } = createWorkspace('migration')
      const failed = runPromotion(root, rollbackTarget).manifest
      const attestation = matchingAttestation(failed) as any
      if (mismatch === 'commits') attestation.candidate.repositories[0].commit = '0'.repeat(40)
      if (mismatch === 'environment') attestation.environment.identity = 'wrong-staging'
      if (mismatch === 'migration head') attestation.candidate.migrationHead = '20200101000000'
      if (mismatch === 'freshness') attestation.recordedAt = '2020-01-01T00:00:00.000Z'

      const { manifest, result } = runPromotion(root, rollbackTarget, attestation)

      expect(result.status).toBe(1)
      expect(manifest.result).toBe('failed')
      expect(manifest.stagingEvidence.result).toBe('rejected')
    },
  )
})
