// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const script = fileURLToPath(new URL('../../scripts/check-prose.mjs', import.meta.url))

/** Run the prose gate against a temporary documentation file. */
function check(file: string, content: string) {
  const directory = mkdtempSync(join(tmpdir(), 'openfray-prose-'))
  try {
    writeFileSync(join(directory, file), content)
    return spawnSync(process.execPath, [script], { cwd: directory, encoding: 'utf8' })
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

describe('changelog prose checks', () => {
  it('preserves dated release notes while checking the unreleased section', () => {
    expect(
      check(
        'CHANGELOG.md',
        '# Changelog\n\n## 1.3.0 (unreleased)\n\nNew colors.\n\n## 1.2.0 (2026-08-24)\n\nHistorical — wording.\n',
      ).status,
    ).toBe(0)
  })

  it('rejects an em-dash aside in the unreleased section', () => {
    expect(
      check(
        'CHANGELOG.md',
        '# Changelog\n\n## 1.3.0 (unreleased)\n\nNew — wording.\n\n## 1.2.0 (2026-08-24)\n\nHistorical notes.\n',
      ).status,
    ).toBe(1)
  })

  it('still checks dated headings in other documentation', () => {
    expect(check('README.md', '# Readme\n\n## 1.2.0 (2026-08-24)\n\nNew — wording.\n').status).toBe(
      1,
    )
  })
})
