// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const PARTS = ['console', 'site', 'handbook']

/** Run a command wired to the terminal, failing the release on any error. */
const run = (command, args = []) => execFileSync(command, args, { stdio: 'inherit' })

/** Return trimmed text from a Git command. */
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()

/** Parse the expected companion commits and optional check-only mode. */
export function parseReleaseArguments(args) {
  const expected = Object.fromEntries(PARTS.map((part) => [part, []]))
  let checkOnly = false
  let message
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (arg === '--check') checkOnly = true
    else if (arg === '--expect') {
      const value = args[++index] ?? ''
      const match = /^(console|site|handbook)=([a-f0-9]{40})$/.exec(value)
      if (!match) throw new Error('--expect requires console|site|handbook=<full commit SHA>.')
      expected[match[1]].push(match[2])
    } else if (!arg.startsWith('-') && message === undefined) message = arg
    else throw new Error(`Unsupported release argument: ${arg}`)
  }
  for (const part of PARTS) {
    if (expected[part].length === 0)
      throw new Error(`List at least one expected ${part} commit with --expect ${part}=<full SHA>.`)
  }
  return { expected, checkOnly, message: message ?? 'Build: Update verified component commits' }
}

/** Resolve integration tips and verify every expected commit before changing any pin. */
export function planRelease(expected) {
  const branch = git('branch', '--show-current')
  if (!branch || branch === 'main' || branch === 'develop')
    throw new Error('Prepare a short-lived branch from develop before running npm run release.')
  if (git('status', '--porcelain', '--untracked-files=all', '--ignore-submodules=none'))
    throw new Error('Commit or resolve working-tree changes before preparing a release.')

  const candidates = []
  for (const part of PARTS) {
    if (git('-C', part, 'rev-parse', '--show-prefix'))
      throw new Error(`Initialize the ${part} submodule before preparing a release.`)
    let integration
    try {
      integration = git('config', '--file', '.gitmodules', '--get', `submodule.${part}.branch`)
    } catch {
      throw new Error(`Set an explicit integration branch for ${part} in .gitmodules.`)
    }
    if (!integration || integration === '.')
      throw new Error(`Set an explicit integration branch for ${part} in .gitmodules.`)
    git('-C', part, 'fetch', 'origin')
    const commit = git('-C', part, 'rev-parse', `refs/remotes/origin/${integration}^{commit}`)
    for (const expectedCommit of expected[part]) {
      try {
        git('-C', part, 'merge-base', '--is-ancestor', expectedCommit, commit)
      } catch {
        throw new Error(
          `${part} ${integration} does not contain expected commit ${expectedCommit}.`,
        )
      }
    }
    candidates.push({ part, integration, commit })
  }
  return { branch, candidates }
}

/** Verify the companion list, then build and push a staging candidate unless checking only. */
export function release(args) {
  const options = parseReleaseArguments(args)
  const { branch, candidates } = planRelease(options.expected)
  for (const { part, integration, commit } of candidates)
    console.log(
      `${part}: origin/${integration} at ${commit} contains every listed companion commit.`,
    )
  if (options.checkOnly) {
    console.log('Check only: component pins, installation, build, commit, and push are unchanged.')
    return
  }

  for (const { part, commit } of candidates)
    run('git', ['-C', part, 'checkout', '--detach', commit])
  run('npm', ['install'])
  const changed = git('status', '--porcelain', 'console', 'site', 'handbook', 'package-lock.json')
  if (!changed) {
    console.log('Nothing to release: every part is already at its shipped commit.')
    return
  }

  run('npm', ['run', 'build'])
  run('git', ['add', 'console', 'site', 'handbook', 'package-lock.json'])
  run('git', ['commit', '-s', '-m', options.message])
  run('git', ['push', '--set-upstream', 'origin', branch])
  console.log(`\nRelease update pushed at ${git('rev-parse', 'HEAD')}.`)
  console.log('Open a pull request into develop. Cloudflare deploys it to staging after merge.')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  release(process.argv.slice(2))
