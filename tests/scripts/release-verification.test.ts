// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const SCRIPT = resolve(__dirname, '../../scripts/release-verification.mjs')
const roots: string[] = []
const PRIVATE_VALUES = {
  authored: 'authored-private-encounter-text',
  account: 'private-account@example.com',
  capability: 'capability-code-private',
  credential: 'credential-private-value',
  secret: 'secret-private-value',
  rejected: 'raw-rejected-private-value',
} as const

interface FixtureOptions {
  validator?: false | 'pass' | 'reject-private-values' | 'private-metadata'
}

/** Write a synthetic fixture file and create its parent directories. */
function writeFixtureFile(root: string, path: string, content: string): void {
  const absolute = join(root, path)
  mkdirSync(dirname(absolute), { recursive: true })
  writeFileSync(absolute, content)
}

/** Initialize and commit every current file in a synthetic repository. */
function initializeRepository(root: string): void {
  execFileSync('git', ['init', '-q'], { cwd: root })
  execFileSync('git', ['config', 'user.email', 'release-test@invalid.example'], { cwd: root })
  execFileSync('git', ['config', 'user.name', 'Release test'], { cwd: root })
  execFileSync('git', ['config', 'advice.addEmbeddedRepo', 'false'], { cwd: root })
  execFileSync('git', ['add', '.'], { cwd: root })
  execFileSync('git', ['commit', '-q', '-m', 'Test fixture'], { cwd: root })
}

/** Build a committed deployment workspace around the selected fixture-check behavior. */
function createWorkspaceFixture(options: FixtureOptions = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'release-verification-'))
  roots.push(root)

  const authored = JSON.stringify(PRIVATE_VALUES)
  const fixtureHash = createHash('sha256').update(authored).digest('hex')
  const safeProjection = {
    fixtures: [
      {
        id: 'hardening.hostile.v1',
        fixtureClass: 'hostile',
        sha256: fixtureHash,
      },
    ],
  }
  const validator =
    options.validator === 'reject-private-values'
      ? `console.error(${JSON.stringify(Object.values(PRIVATE_VALUES).join(' '))}); process.exit(1)`
      : options.validator === 'private-metadata'
        ? `console.log(${JSON.stringify(JSON.stringify({ ...safeProjection, fixtures: [{ ...safeProjection.fixtures[0], id: PRIVATE_VALUES.secret }] }))})`
        : `console.log(${JSON.stringify(JSON.stringify(safeProjection))})`

  writeFixtureFile(root, 'console/private-input.json', authored)
  if (options.validator !== false) {
    writeFixtureFile(root, 'console/scripts/validate-hardening-fixtures.mjs', validator)
  }
  initializeRepository(join(root, 'console'))

  for (const repository of ['site', 'handbook']) {
    writeFixtureFile(root, `${repository}/README.md`, repository)
    initializeRepository(join(root, repository))
  }

  writeFixtureFile(root, 'package.json', JSON.stringify({ name: 'release-fixture', private: true }))
  writeFixtureFile(root, 'package-lock.json', '{"lockfileVersion":3}\n')
  initializeRepository(root)
  return root
}

/** Run the public release-verification command against a synthetic workspace. */
function runVerification(root: string, options: string[] = []) {
  const output = mkdtempSync(join(tmpdir(), 'release-evidence-'))
  roots.push(output)
  const result = spawnSync(
    process.execPath,
    [SCRIPT, '--output', output, '--environment', 'local', '--approver', 'pending', ...options],
    { cwd: root, encoding: 'utf8' },
  )
  return {
    result,
    manifest: JSON.parse(readFileSync(join(output, 'evidence-manifest.json'), 'utf8')),
    report: readFileSync(join(output, 'release-report.md'), 'utf8'),
  }
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('release verification', () => {
  it('emits machine-readable evidence and a readable advisory report', () => {
    const root = createWorkspaceFixture()
    const { manifest, report, result } = runVerification(root)

    expect(result.status).toBe(0)
    expect(manifest).toMatchObject({
      schemaVersion: 1,
      releaseClass: 'advisory',
      result: 'passed',
      approver: 'pending',
      rollbackTarget: null,
      environment: {
        identity: 'local',
      },
      checks: [
        {
          id: 'canonical-hardening-fixtures',
          requirementIds: ['EF-1'],
          applicable: true,
          command:
            'node console/scripts/validate-hardening-fixtures.mjs console/tests/fixtures/hardening/catalog.json --evidence',
          result: 'passed',
        },
      ],
    })
    expect(manifest.inputs.repositories.map((entry: { name: string }) => entry.name)).toEqual([
      'openfray',
      'console',
      'site',
      'handbook',
    ])
    expect(
      manifest.inputs.repositories.every((entry: { commit: string }) =>
        /^[0-9a-f]{40}$/.test(entry.commit),
      ),
    ).toBe(true)
    expect(manifest.inputs.lockfiles).toEqual([
      { path: 'package-lock.json', sha256: expect.stringMatching(/^[0-9a-f]{64}$/) },
    ])
    expect(manifest.inputs.fixtures).toEqual([
      {
        id: 'hardening.hostile.v1',
        fixtureClass: 'hostile',
        sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
    ])
    expect(report).toContain('# Release verification report')
    expect(report).toContain(
      '| EF-1 | Canonical hardening fixtures | `node console/scripts/validate-hardening-fixtures.mjs console/tests/fixtures/hardening/catalog.json --evidence` | Passed |',
    )
  })

  it('records an applicable missing check and exits unsuccessfully', () => {
    const root = createWorkspaceFixture({ validator: false })
    const { manifest, report, result } = runVerification(root)

    expect(result.status).toBe(1)
    expect(manifest.result).toBe('failed')
    expect(manifest.checks).toEqual([
      expect.objectContaining({
        id: 'canonical-hardening-fixtures',
        applicable: true,
        result: 'missing',
      }),
    ])
    expect(report).toContain(
      '| EF-1 | Canonical hardening fixtures | `node console/scripts/validate-hardening-fixtures.mjs console/tests/fixtures/hardening/catalog.json --evidence` | Missing |',
    )
  })

  it('never copies private fixture data or rejected command output into evidence', () => {
    const root = createWorkspaceFixture({ validator: 'reject-private-values' })
    const { manifest, report, result } = runVerification(root)
    const evidence = `${JSON.stringify(manifest)}\n${report}`

    expect(result.status).toBe(1)
    for (const privateValue of Object.values(PRIVATE_VALUES)) {
      expect(evidence).not.toContain(privateValue)
    }
    expect(evidence).not.toContain('stdout')
    expect(evidence).not.toContain('stderr')
    expect(manifest.checks[0].result).toBe('failed')
  })

  it('rejects private values injected into fixture identity metadata', () => {
    const root = createWorkspaceFixture({ validator: 'private-metadata' })
    const { manifest, report, result } = runVerification(root)
    const evidence = `${JSON.stringify(manifest)}\n${report}`

    expect(result.status).toBe(1)
    expect(manifest.checks[0].result).toBe('failed')
    expect(manifest.inputs.fixtures).toEqual([])
    expect(evidence).not.toContain(PRIVATE_VALUES.secret)
  })

  it('requires an immutable rollback target for production evidence', () => {
    const root = createWorkspaceFixture()
    const { manifest, report, result } = runVerification(root, ['--environment', 'production'])

    expect(result.status).toBe(1)
    expect(manifest.rollbackTarget).toBeNull()
    expect(manifest.inputs.rollbackReady).toBe(false)
    expect(report).toContain('- **Rollback target:** Missing')
  })
})
