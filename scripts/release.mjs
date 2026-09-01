// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

// Releases the site: pulls each part's latest main, syncs the lockfile to any
// dependency changes, proves the assembled build, then commits the submodule
// pointers and pushes. The push is what triggers the production deploy, so this
// script is the session's one deliberate push.
import { execFileSync, execSync } from 'node:child_process'

/** Run a shell command wired to the terminal, failing the release on any error. */
const run = (cmd) => execSync(cmd, { stdio: 'inherit' })

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
execFileSync('git', ['commit', '-m', message], { stdio: 'inherit' })
run('git push')
