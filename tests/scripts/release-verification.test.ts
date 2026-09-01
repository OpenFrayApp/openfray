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

interface FixtureOptions {
  catalog?: boolean
  validator?: 'pass' | 'reject-private-values'
}

/** Write a file and create its parent directories. */
function file(root: string, path: string, content: string): void {
  const absolute = join(root, path)
  mkdirSync(dirname(absolute), { recursive: true })
  writeFileSync(absolute, content)
}

/** Commit every current file in a synthetic repository. */
function commit(root: string): void {
  execFileSync('git', ['init', '-q'], { cwd: root })
  execFileSync('git', ['config', 'user.email', 'release-test@invalid.example'], { cwd: root })
  execFileSync('git', ['config', 'user.name', 'Release test'], { cwd: root })
  execFileSync('git', ['config', 'advice.addEmbeddedRepo', 'false'], { cwd: root })
  execFileSync('git', ['add', '.'], { cwd: root })
  execFileSync('git', ['commit', '-q', '-m', 'Test fixture'], { cwd: root })
}

/** Build a committed deployment workspace around the selected fixture-check behavior. */
function workspace(options: FixtureOptions = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'release-verification-'))
  roots.push(root)

  const authored = JSON.stringify({
    note: 'authored-private-encounter-text',
    account: 'private-account@example.com',
    capabilityCode: 'capability-code-private',
    credential: 'credential-private-value',
    secret: 'secret-private-value',
    rejected: 'raw-rejected-private-value',
  })
  const fixtureHash = createHash('sha256').update(authored).digest('hex')
  const validator =
    options.validator === 'reject-private-values'
      ? "console.error('authored-private-encounter-text private-account@example.com capability-code-private credential-private-value secret-private-value raw-rejected-private-value'); process.exit(1)"
      : "console.log('fixture check passed')"

  file(
    root,
    'console/package.json',
    JSON.stringify({
      name: 'console-fixture',
      private: true,
      scripts: { 'validate:fixtures': 'node validate-fixtures.mjs' },
    }),
  )
  file(root, 'console/validate-fixtures.mjs', validator)
  if (options.catalog !== false) {
    file(root, 'console/tests/fixtures/hardening/private-input.json', authored)
    file(
      root,
      'console/tests/fixtures/hardening/catalog.json',
      JSON.stringify({
        catalogVersion: 1,
        fixtures: [
          {
            id: 'hardening.hostile.v1',
            fixtureClass: 'hostile',
            path: 'private-input.json',
            sha256: fixtureHash,
            provenance: 'synthetic',
            description: 'Description is deliberately excluded from evidence.',
          },
        ],
      }),
    )
  }
  commit(join(root, 'console'))

  for (const repository of ['site', 'handbook']) {
    file(root, `${repository}/README.md`, repository)
    commit(join(root, repository))
  }

  file(
    root,
    'package.json',
    JSON.stringify({ name: 'release-fixture', private: true, workspaces: ['console'] }),
  )
  file(root, 'package-lock.json', '{"lockfileVersion":3}\n')
  commit(root)
  return root
}

/** Run the public release-verification command against a synthetic workspace. */
function verify(root: string) {
  const output = mkdtempSync(join(tmpdir(), 'release-evidence-'))
  roots.push(output)
  const result = spawnSync(
    process.execPath,
    [SCRIPT, '--output', output, '--environment', 'local', '--approver', 'pending'],
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
    const root = workspace()
    const { manifest, report, result } = verify(root)

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
          command: 'npm run validate:fixtures --workspace console',
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
      '| EF-1 | Canonical hardening fixtures | `npm run validate:fixtures --workspace console` | Passed |',
    )
  })

  it('records an applicable missing check and exits unsuccessfully', () => {
    const root = workspace({ catalog: false })
    const { manifest, report, result } = verify(root)

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
      '| EF-1 | Canonical hardening fixtures | `npm run validate:fixtures --workspace console` | Missing |',
    )
  })

  it('never copies private fixture data or rejected command output into evidence', () => {
    const root = workspace({ validator: 'reject-private-values' })
    const { manifest, report, result } = verify(root)
    const evidence = `${JSON.stringify(manifest)}\n${report}`

    expect(result.status).toBe(1)
    for (const privateValue of [
      'authored-private-encounter-text',
      'private-account@example.com',
      'capability-code-private',
      'credential-private-value',
      'secret-private-value',
      'raw-rejected-private-value',
    ]) {
      expect(evidence).not.toContain(privateValue)
    }
    expect(evidence).not.toContain('stdout')
    expect(evidence).not.toContain('stderr')
    expect(manifest.checks[0].result).toBe('failed')
  })
})
