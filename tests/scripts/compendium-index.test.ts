// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
// @ts-expect-error — a plain build script, deliberately untyped.
import {
  indexCreatures,
  indexFileFor,
  writeCompendiumIndexes,
} from '../../scripts/compendium-index.mjs'

const COMPENDIUM = resolve(__dirname, '../../console/public/compendium')
let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'compendium-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

/** One library file in the fixture folder. */
function library(name: string, creatures: unknown[]): void {
  writeFileSync(join(dir, name), JSON.stringify(creatures))
}

describe('compendium-index', () => {
  it('keeps only what a card can say, and drops what a card never reads', () => {
    const index = indexCreatures([
      {
        id: 'srd-5.2:goblin',
        name: 'Goblin',
        size: 'Small',
        type: 'humanoid',
        alignment: 'chaotic neutral',
        cr: 0.25,
        xp: 50,
        ac: 15,
        maxHp: 10,
        actions: [{ name: 'Scimitar' }],
      },
    ])
    expect(index['srd-5.2:goblin']).toEqual({
      name: 'Goblin',
      size: 'Small',
      type: 'humanoid',
      alignment: 'chaotic neutral',
      cr: 0.25,
      xp: 50,
    })
  })

  // A homebrew stat block saved without one, and the one shipped creature that has none:
  // the key must be absent rather than null, so the card can drop the whole stat row.
  it('omits a challenge rating and an alignment it does not have', () => {
    const index = indexCreatures([{ id: 'x:y', name: 'Y', size: 'Tiny', type: 'ooze' }])
    expect(index['x:y']).toEqual({ name: 'Y', size: 'Tiny', type: 'ooze' })
    expect('cr' in index['x:y']).toBe(false)
  })

  it('writes one sidecar per library of stat blocks, and none for a book of spells', () => {
    library('srd-creatures.json', [
      { id: 'srd-5.2:goblin', name: 'Goblin', size: 'Small', type: 'humanoid' },
    ])
    library('srd-spells.json', [{ id: 'srd-5.2:fireball', name: 'Fireball' }])
    const written = writeCompendiumIndexes(dir)
    expect(written).toEqual(['srd-creatures.index.json'])
    expect(existsSync(join(dir, 'srd-spells.index.json'))).toBe(false)
    const index = JSON.parse(readFileSync(join(dir, 'srd-creatures.index.json'), 'utf8'))
    expect(index['srd-5.2:goblin'].name).toBe('Goblin')
  })

  it('names the sidecar after the library it sits beside', () => {
    expect(indexFileFor('tob3-creatures.json')).toBe('tob3-creatures.index.json')
  })

  // The real thing, not a fixture. A sidecar that has drifted from its book is invisible
  // until a card names the wrong creature, so the shipped data is checked directly.
  describe('against the shipped compendium', () => {
    const files = readdirSync(COMPENDIUM).filter((f) => f.endsWith('-creatures.json'))

    it('finds libraries to index', () => {
      expect(files.length).toBeGreaterThan(0)
    })

    it.each(files)('indexes every id in %s, with its own name and challenge', (file) => {
      const creatures = JSON.parse(readFileSync(join(COMPENDIUM, file), 'utf8'))
      const index = indexCreatures(creatures)
      expect(Object.keys(index)).toHaveLength(creatures.length)
      for (const creature of creatures) {
        expect(index[creature.id].name).toBe(creature.name)
        expect(index[creature.id].cr).toBe(creature.cr ?? undefined)
      }
    })

    // The whole reason the index exists: it has to stay small however the books grow.
    it.each(files)('%s summarises to a fraction of the book', (file) => {
      const raw = readFileSync(join(COMPENDIUM, file), 'utf8')
      const index = JSON.stringify(indexCreatures(JSON.parse(raw)))
      expect(index.length).toBeLessThan(raw.length / 10)
    })
  })
})
