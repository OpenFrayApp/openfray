// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const SCRIPT = resolve(import.meta.dirname, '../../scripts/release.mjs')
const parts = ['console', 'site', 'handbook'] as const
let root: string
let workspace: string
let initial: Record<string, string>
let expected: Record<string, string>

/** Run Git against an isolated fixture repository. */
function git(cwd: string, ...args: string[]) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

/** Initialize a repository with a fixture-only identity. */
function init(path: string, branch: string) {
  mkdirSync(path, { recursive: true })
  git(path, 'init', '-b', branch)
  git(path, 'config', 'user.email', 'release-test@invalid.example')
  git(path, 'config', 'user.name', 'Release fixture')
}

/** Commit a distinct companion change in a component fixture. */
function commit(path: string, filename: string) {
  writeFileSync(join(path, filename), filename)
  git(path, 'add', filename)
  git(path, 'commit', '-m', filename)
  return git(path, 'rev-parse', 'HEAD')
}

/** Run the release CLI with explicit fixture expectations. */
function check(args?: string[]) {
  return spawnSync(
    process.execPath,
    [
      SCRIPT,
      ...(args ?? [
        '--check',
        ...parts.flatMap((part) => ['--expect', `${part}=${expected[part]}`]),
      ]),
    ],
    { cwd: workspace, encoding: 'utf8' },
  )
}

/** Return the fixture's current component pins. */
function pins() {
  return Object.fromEntries(
    parts.map((part) => [part, git(join(workspace, part), 'rev-parse', 'HEAD')]),
  )
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'openfray-release-'))
  workspace = join(root, 'workspace')
  initial = {}
  expected = {}
  init(workspace, 'main')
  for (const part of parts) {
    const origin = join(root, `origin-${part}`)
    const branch = part === 'console' ? 'develop' : 'main'
    init(origin, branch)
    initial[part] = commit(origin, 'initial.txt')
    git(
      workspace,
      '-c',
      'protocol.file.allow=always',
      'submodule',
      'add',
      '-b',
      branch,
      origin,
      part,
    )
    expected[part] = commit(origin, 'companion.txt')
  }
  writeFileSync(join(workspace, 'package-lock.json'), '{}\n')
  git(workspace, 'add', 'package-lock.json')
  git(workspace, 'commit', '-am', 'Initial component pins')
  git(workspace, 'switch', '-c', 'release/fixture')
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('release completeness', () => {
  it('verifies integration tips without changing pins or the parent commit', () => {
    const head = git(workspace, 'rev-parse', 'HEAD')
    const result = check()
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain(`console: origin/develop at ${expected.console}`)
    expect(result.stdout).toContain(`site: origin/main at ${expected.site}`)
    expect(result.stdout).toContain(`handbook: origin/main at ${expected.handbook}`)
    expect(result.stdout).toContain('Check only:')
    expect(pins()).toEqual(initial)
    expect(git(workspace, 'rev-parse', 'HEAD')).toBe(head)
    expect(git(workspace, 'status', '--porcelain')).toBe('')
  })

  it('pins verified tips and runs the existing install/build/commit/push sequence', () => {
    const remote = join(root, 'parent-remote')
    mkdirSync(remote)
    git(remote, 'init', '--bare')
    git(workspace, 'remote', 'add', 'origin', remote)
    const bin = join(root, 'bin')
    mkdirSync(bin)
    const commands = join(root, 'npm-commands.txt')
    writeFileSync(join(bin, 'npm'), '#!/bin/sh\nprintf "%s\\n" "$*" >> "$RELEASE_TEST_COMMANDS"\n')
    chmodSync(join(bin, 'npm'), 0o755)
    const result = spawnSync(
      process.execPath,
      [
        SCRIPT,
        ...parts.flatMap((part) => ['--expect', `${part}=${expected[part]}`]),
        'Build: Pin reviewed companions',
      ],
      {
        cwd: workspace,
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          RELEASE_TEST_COMMANDS: commands,
        },
      },
    )
    expect(result.status, result.stderr).toBe(0)
    expect(pins()).toEqual(expected)
    expect(readFileSync(commands, 'utf8')).toBe('install\nrun build\n')
    expect(git(workspace, 'log', '-1', '--format=%s')).toBe('Build: Pin reviewed companions')
    expect(git(workspace, 'log', '-1', '--format=%b')).toContain('Signed-off-by: Release fixture')
    expect(git(workspace, 'rev-parse', 'HEAD')).toBe(
      git(remote, 'rev-parse', 'refs/heads/release/fixture'),
    )
    expect(git(workspace, 'status', '--porcelain')).toBe('')
  })

  it('accepts an expected commit contained in a newer integration tip', () => {
    const tip = commit(join(root, 'origin-handbook'), 'later.txt')
    const result = check()
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain(`handbook: origin/main at ${tip}`)
    expect(pins()).toEqual(initial)
  })

  it('blocks a missing handbook companion before changing any component pin', () => {
    const origin = join(root, 'origin-handbook')
    git(origin, 'switch', '-c', 'feature/forgotten-companion')
    expected.handbook = commit(origin, 'forgotten.txt')
    git(origin, 'switch', 'main')
    const result = check([
      '--expect',
      `console=${expected.console}`,
      '--expect',
      `site=${expected.site}`,
      '--expect',
      `handbook=${expected.handbook}`,
    ])
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain(
      `handbook main does not contain expected commit ${expected.handbook}`,
    )
    expect(pins()).toEqual(initial)
    expect(git(workspace, 'status', '--porcelain')).toBe('')
  })

  it('checks every listed companion for a component, not just the first', () => {
    const origin = join(root, 'origin-console')
    git(origin, 'switch', '-c', 'feature/unmerged')
    const missing = commit(origin, 'unmerged.txt')
    git(origin, 'switch', 'develop')
    const result = check([
      '--check',
      '--expect',
      `console=${expected.console}`,
      '--expect',
      `console=${missing}`,
      '--expect',
      `site=${expected.site}`,
      '--expect',
      `handbook=${expected.handbook}`,
    ])
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain(`console develop does not contain expected commit ${missing}`)
    expect(pins()).toEqual(initial)
  })

  it.each(parts)('requires an explicit expected commit for %s', (omitted) => {
    const result = check([
      '--check',
      ...parts
        .filter((part) => part !== omitted)
        .flatMap((part) => ['--expect', `${part}=${expected[part]}`]),
    ])
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain(`List at least one expected ${omitted} commit`)
    expect(pins()).toEqual(initial)
  })

  it.each(['--expect', '--expect=console=abc', '--unknown', '--expect console=abc'])(
    'rejects malformed arguments: %s',
    (arg) => {
      const result = check([arg])
      expect(result.status).not.toBe(0)
      expect(pins()).toEqual(initial)
    },
  )

  it('rejects a well-formed but unknown expected commit', () => {
    expected.site = 'f'.repeat(40)
    const result = check()
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('site main does not contain expected commit')
    expect(pins()).toEqual(initial)
  })

  it.each(['main', 'develop'])('rejects release execution on %s', (branch) => {
    if (branch === 'develop') git(workspace, 'switch', '-c', branch)
    else git(workspace, 'switch', branch)
    const result = check()
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('Prepare a short-lived branch from develop')
  })

  it('rejects detached parent HEAD', () => {
    git(workspace, 'checkout', '--detach')
    expect(check().stderr).toContain('Prepare a short-lived branch from develop')
  })

  it.each(['parent', 'component'])('preserves dirty %s work without updating pins', (scope) => {
    const path = scope === 'parent' ? workspace : join(workspace, 'console')
    writeFileSync(join(path, 'draft.txt'), 'Unrelated work')
    const result = check()
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('Commit or resolve working-tree changes')
    expect(readFileSync(join(path, 'draft.txt'), 'utf8')).toBe('Unrelated work')
    expect(pins()).toEqual(initial)
  })

  it('requires explicit component integration branches', () => {
    git(workspace, 'config', '--file', '.gitmodules', '--unset', 'submodule.console.branch')
    git(workspace, 'commit', '-am', 'Remove explicit branch')
    expect(check().stderr).toContain('Set an explicit integration branch for console')
    expect(pins()).toEqual(initial)
  })

  it('rejects uninitialized submodules without checking out replacement pins', () => {
    git(workspace, 'submodule', 'deinit', 'handbook')
    const result = check()
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('Initialize the handbook submodule')
    expect(git(join(workspace, 'console'), 'rev-parse', 'HEAD')).toBe(initial.console)
    expect(git(workspace, 'status', '--porcelain')).toBe('')
  })
})
