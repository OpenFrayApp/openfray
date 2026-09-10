// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const productionFiles = [
  'share-card/card.ts',
  'share-card/describe.ts',
  'share-card/image.ts',
  'functions/s/[code].ts',
  'functions/s/[code]/og.png.ts',
]

/** Read one deployment file from the workspace root. */
function source(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
}

describe('shared-route publication boundary', () => {
  it('imports console semantics only through the publication entrypoint', () => {
    for (const path of productionFiles) {
      const imports = source(path).match(/from ['"]\.\.\/.*console\/src\/[^'"]+/g) ?? []
      expect(imports, path).toEqual(
        imports.filter((statement) => statement.includes('console/src/publication/index.ts')),
      )
    }
  })
})
