// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

import { execFileSync, execSync } from 'node:child_process'

/** Run a shell command wired to the terminal, failing the release on any error. */
const run = (command) => execSync(command, { stdio: 'inherit' })

/** Return trimmed text from a Git command. */
const git = (...arguments_) => execFileSync('git', arguments_, { encoding: 'utf8' }).trim()

const branch = git('branch', '--show-current')
if (!branch || branch === 'main') {
  throw new Error('Prepare a release candidate branch before running npm run release.')
}
const rollbackTarget = git('rev-parse', 'origin/main')

run('git submodule update --remote')
run('npm install')

const changed = execSync('git status --porcelain console site handbook package-lock.json', {
  encoding: 'utf8',
}).trim()
if (!changed) {
  console.log('Nothing to release: every part is already at its shipped commit.')
  process.exit(0)
}

run('npm run build')

const message = process.argv[2] ?? 'Build: release the latest of every part'
run('git add console site handbook package-lock.json')
execFileSync('git', ['commit', '-s', '-m', message], { stdio: 'inherit' })
execFileSync('git', ['push', '--set-upstream', 'origin', branch], { stdio: 'inherit' })

const candidateCommit = git('rev-parse', 'HEAD')
console.log('\nRelease candidate prepared. Stage it with:')
console.log(
  `gh workflow run staging-candidate.yml -f candidate_commit=${candidateCommit} -f rollback_target=${rollbackTarget}`,
)
console.log('After staging review, promote its workflow run through production-promotion.yml.')
