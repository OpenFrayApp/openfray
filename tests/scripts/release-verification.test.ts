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
  registry?: false | ((registry: Record<string, unknown>) => void)
}

/** Return a complete synthetic evidence-source registry. */
function evidenceSourceRegistry(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    environments: [
      {
        kind: 'local',
        identity: 'openfray-local',
        authority: 'maintainer',
        probePolicy: 'local-only',
      },
      {
        kind: 'staging',
        identity: 'openfray-staging',
        authority: 'maintainer',
        probePolicy: 'authorized-staging-only',
      },
      {
        kind: 'production',
        identity: 'openfray-production',
        authority: 'maintainer',
        probePolicy: 'separate-written-authorization-required',
      },
    ],
    providerBaselines: [
      {
        id: 'supabase',
        ownerRepository: 'console',
        authority: { kind: 'source-file', path: 'console/provider-baseline.json' },
        collectionMethod: 'mixed',
        unsupportedManualChecks: ['dashboard-review'],
        availability: 'available',
        unavailableReason: null,
        freshness: {
          maximumAgeDays: 90,
          invalidatedBy: [
            'source-commit',
            'lockfile',
            'migration-head',
            'fixture-hashes',
            'baseline-hash',
            'environment-identity',
          ],
        },
      },
    ],
    deviceCoverage: [
      {
        id: 'windows-firefox-nvda',
        deviceClass: 'desktop',
        operatingSystem: 'supported-windows',
        browser: 'current-firefox',
        assistiveTechnology: 'nvda',
        inputs: ['keyboard'],
        evidenceMethod: 'physical-manual',
        availability: 'unavailable',
        unavailableReason: 'access-not-recorded',
      },
    ],
  }
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
  writeFixtureFile(root, 'console/provider-baseline.json', '{"version":1}\n')
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
  if (options.registry !== false) {
    const registry = evidenceSourceRegistry()
    options.registry?.(registry)
    writeFixtureFile(root, 'release-evidence/sources.json', `${JSON.stringify(registry)}\n`)
  }
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
        kind: 'local',
        identity: 'openfray-local',
        probePolicy: 'local-only',
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
        {
          id: 'release-evidence-sources',
          requirementIds: ['EF-3'],
          applicable: true,
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
    expect(manifest.inputs.evidenceSourceRegistry).toEqual({
      path: 'release-evidence/sources.json',
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    })
    expect(manifest.inputs.providerBaselines).toEqual([
      expect.objectContaining({
        id: 'supabase',
        authoritySha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
    ])
    expect(manifest.inputs.deviceCoverage).toEqual([
      expect.objectContaining({
        id: 'windows-firefox-nvda',
        availability: 'unavailable',
      }),
    ])
    expect(report).toContain('# Release verification report')
    expect(report).toContain('### Provider baselines')
    expect(report).toContain('### Physical-device coverage')
    expect(report).toContain(
      '| EF-1 | Canonical hardening fixtures | `node console/scripts/validate-hardening-fixtures.mjs console/tests/fixtures/hardening/catalog.json --evidence` | Passed |',
    )
  })

  it('records an applicable missing check and exits unsuccessfully', () => {
    const root = createWorkspaceFixture({ validator: false })
    const { manifest, report, result } = runVerification(root)

    expect(result.status).toBe(1)
    expect(manifest.result).toBe('failed')
    expect(manifest.checks).toContainEqual(
      expect.objectContaining({
        id: 'canonical-hardening-fixtures',
        applicable: true,
        result: 'missing',
      }),
    )
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
    expect(manifest.environment).toMatchObject({
      identity: 'openfray-production',
      probePolicy: 'separate-written-authorization-required',
    })
    expect(report).toContain('- **Rollback target:** Missing')
  })

  it('selects distinct recorded identities for every environment', () => {
    const root = createWorkspaceFixture()
    const local = runVerification(root).manifest.environment
    const staging = runVerification(root, ['--environment', 'staging']).manifest.environment
    const production = runVerification(root, ['--environment', 'production']).manifest.environment

    expect([local.identity, staging.identity, production.identity]).toEqual([
      'openfray-local',
      'openfray-staging',
      'openfray-production',
    ])
    expect(new Set([local.identity, staging.identity, production.identity]).size).toBe(3)
  })

  it('records missing evidence-source registry as an applicable failed gate', () => {
    const root = createWorkspaceFixture({ registry: false })
    const { manifest, report, result } = runVerification(root)

    expect(result.status).toBe(1)
    expect(manifest.checks).toContainEqual(
      expect.objectContaining({ id: 'release-evidence-sources', result: 'missing' }),
    )
    expect(manifest.inputs.evidenceSourceRegistry).toBeNull()
    expect(report).toContain('| EF-3 | Release evidence sources')
    expect(report).toContain('| release-evidence/sources.json | Missing |')
  })

  it('rejects duplicate environment identities without copying registry values', () => {
    const root = createWorkspaceFixture({
      registry(registry) {
        const environments = registry.environments as Array<Record<string, unknown>>
        environments[1].identity = environments[0].identity
        environments[2].privateValue = PRIVATE_VALUES.account
      },
    })
    const { manifest, report, result } = runVerification(root)
    const evidence = `${JSON.stringify(manifest)}\n${report}`

    expect(result.status).toBe(1)
    expect(manifest.checks).toContainEqual(
      expect.objectContaining({ id: 'release-evidence-sources', result: 'failed' }),
    )
    expect(manifest.inputs.providerBaselines).toEqual([])
    expect(evidence).not.toContain(PRIVATE_VALUES.account)
  })

  it('rejects privacy-sensitive source identifiers without copying them', () => {
    const root = createWorkspaceFixture({
      registry(registry) {
        const providers = registry.providerBaselines as Array<Record<string, unknown>>
        providers[0].id = PRIVATE_VALUES.capability
      },
    })
    const { manifest, report, result } = runVerification(root)
    const evidence = `${JSON.stringify(manifest)}\n${report}`

    expect(result.status).toBe(1)
    expect(manifest.checks).toContainEqual(
      expect.objectContaining({ id: 'release-evidence-sources', result: 'failed' }),
    )
    expect(evidence).not.toContain(PRIVATE_VALUES.capability)
  })

  it('changes a provider baseline hash when its reviewed authority changes', () => {
    const firstRoot = createWorkspaceFixture()
    const secondRoot = createWorkspaceFixture({
      registry(registry) {
        const providers = registry.providerBaselines as Array<Record<string, unknown>>
        providers[0].unsupportedManualChecks = ['dashboard-review', 'redirect-review']
      },
    })

    const first = runVerification(firstRoot).manifest.inputs.providerBaselines[0].sha256
    const second = runVerification(secondRoot).manifest.inputs.providerBaselines[0].sha256
    expect(first).not.toBe(second)
  })
})
