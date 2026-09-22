// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const script = resolve(__dirname, '../../scripts/check-deployment-env.mjs')
const configured = {
  VITE_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'sb_publishable_test',
  VITE_TURNSTILE_SITE_KEY: 'public-test-site-key',
}

/** Run the hosted-build preflight without inheriting local credentials. */
function check(environment: Record<string, string>) {
  return spawnSync(process.execPath, [script], { encoding: 'utf8', env: environment })
}

describe('hosted build configuration', () => {
  it('accepts the public build settings', () => {
    expect(check(configured).status).toBe(0)
  })

  it.each(Object.keys(configured))('fails when %s is missing', (key) => {
    const result = check({ ...configured, [key]: '' })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain(key)
    expect(result.stderr).not.toContain(configured.VITE_SUPABASE_ANON_KEY)
  })

  it.each(['staging-candidate', 'production-promotion'])(
    'wires protected public settings into %s builds',
    (name) => {
      const workflow = readFileSync(
        resolve(__dirname, `../../.github/workflows/${name}.yml`),
        'utf8',
      )
      for (const key of Object.keys(configured)) {
        expect(workflow).toContain(`${key}: \${{ vars.${key} }}`)
      }
      expect(workflow.indexOf('node scripts/check-deployment-env.mjs')).toBeGreaterThan(-1)
      expect(workflow.indexOf('node scripts/check-deployment-env.mjs')).toBeLessThan(
        workflow.indexOf('npm run build'),
      )
      expect(workflow).toContain("node-version: '24'")
    },
  )
})
