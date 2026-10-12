// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const script = resolve('scripts/build-site.mjs')
let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'auth-build-'))
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ scripts: { 'build:parts': 'node capture.cjs' } }),
  )
  writeFileSync(
    join(dir, 'capture.cjs'),
    `require('node:fs').writeFileSync('build-env.json', JSON.stringify({ siteUrl: process.env.PUBLIC_SUPABASE_URL, consoleUrl: process.env.VITE_SUPABASE_URL, siteKey: process.env.PUBLIC_SUPABASE_ANON_KEY, consoleKey: process.env.VITE_SUPABASE_ANON_KEY }))`,
  )
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('assembled build command', () => {
  it('maps public configuration before starting workspace builds', () => {
    const result = spawnSync('node', [script], {
      cwd: dir,
      env: {
        ...process.env,
        VITE_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
        VITE_SUPABASE_ANON_KEY: 'sb_publishable_mock',
        PUBLIC_SUPABASE_URL: '',
        PUBLIC_SUPABASE_ANON_KEY: '',
      },
      encoding: 'utf8',
    })
    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(readFileSync(join(dir, 'build-env.json'), 'utf8'))).toEqual({
      siteUrl: 'https://abcdefghijklmnopqrst.supabase.co',
      consoleUrl: 'https://abcdefghijklmnopqrst.supabase.co',
      siteKey: 'sb_publishable_mock',
      consoleKey: 'sb_publishable_mock',
    })
  })

  it('stops before any builds run when the site key conflicts', () => {
    const result = spawnSync('node', [script], {
      cwd: dir,
      env: {
        ...process.env,
        VITE_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
        VITE_SUPABASE_ANON_KEY: 'sb_publishable_mock',
        PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_other',
      },
      encoding: 'utf8',
    })
    expect(result.status).not.toBe(0)
    expect(existsSync(join(dir, 'build-env.json'))).toBe(false)
    expect(result.stderr).toContain('conflicts')
    expect(result.stderr).not.toContain('sb_publishable_other')
  })
})
