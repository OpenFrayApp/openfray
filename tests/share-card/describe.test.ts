// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { describeShare, type CardEnv } from '../../share-card/describe.ts'

const CODE = 'k7mqx3rt9p'
const ORIGIN = 'https://openfray.app/s/k7mqx3rt9p'

/** The sidecar the asset server answers with, for the one library these casts name. */
const INDEX = {
  'srd-5.2:goblin': {
    name: 'Goblin',
    size: 'Small',
    type: 'humanoid',
    alignment: 'chaotic neutral',
    cr: 0.25,
    xp: 50,
  },
}

let assetPaths: string[]

/** An env whose database answers with `row` and whose asset server holds the SRD sidecar. */
function envWith(row: unknown, overrides: Partial<CardEnv> = {}): CardEnv {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify(row), { headers: { 'content-type': 'application/json' } }),
    ),
  )
  return {
    SUPABASE_URL: 'https://db.example',
    SUPABASE_ANON_KEY: 'anon',
    ASSETS: {
      async fetch(input) {
        assetPaths.push(new URL(String(input)).pathname)
        return new Response(JSON.stringify(INDEX))
      },
    },
    ...overrides,
  }
}

const encounter = {
  kind: 'encounter',
  data: {
    v: 1,
    name: 'Ambush at the ford',
    by: 'Nicola Mustone',
    license: 'cc-by-4.0',
    note: 'The chief shoves the smallest goblin into the ford.',
    entries: [
      { ref: 'srd-5.2:goblin', count: 4, side: 'foe' },
      { quick: { name: 'Ferryman', maxHp: 9, ac: 11 }, count: 1, side: 'friend' },
    ],
  },
}

beforeEach(() => {
  assetPaths = []
})
afterEach(() => vi.unstubAllGlobals())

describe('describeShare', () => {
  it('names an encounter, counts its cast, and resolves an id against the sidecar', async () => {
    const card = await describeShare(envWith(encounter), CODE, ORIGIN)
    expect(card).toEqual({
      kind: 'encounter',
      name: 'Ambush at the ford',
      chips: [
        { name: 'Goblin', count: 4, side: 'foe' },
        { name: 'Ferryman', count: 1, side: 'friend' },
      ],
      creatures: 5,
      by: 'Nicola Mustone',
      license: 'cc-by-4.0',
    })
  })

  // Pages hands a Function every variable the project declares, and the `VITE_` prefix is
  // only Vite's instruction about what to bake into the client bundle. Reading both spellings
  // means the card works off the pair the console already declares.
  it('finds its credentials under the prefixed names too', async () => {
    const env = envWith(encounter, {
      SUPABASE_URL: undefined,
      SUPABASE_ANON_KEY: undefined,
      VITE_SUPABASE_URL: 'https://db.example',
      VITE_SUPABASE_ANON_KEY: 'anon',
    })
    expect(await describeShare(env, CODE, ORIGIN)).toMatchObject({ name: 'Ambush at the ford' })
  })

  it('reads only the sidecars the cast names, never the books themselves', async () => {
    await describeShare(envWith(encounter), CODE, ORIGIN)
    expect(assetPaths).toEqual(['/console/compendium/srd-creatures.index.json'])
  })

  it('puts the foes first, whatever order the cast was arranged in', async () => {
    const mixed = {
      kind: 'encounter',
      data: {
        v: 1,
        name: 'Rescue',
        entries: [
          { quick: { name: 'Villager', maxHp: 4, ac: 10 }, count: 2, side: 'friend' },
          { ref: 'srd-5.2:goblin', count: 1, side: 'foe' },
        ],
      },
    }
    const card = await describeShare(envWith(mixed), CODE, ORIGIN)
    expect(card && 'chips' in card && card.chips.map((c) => c.side)).toEqual(['foe', 'friend'])
  })

  it('reads a creature share from its own stat block, licence included', async () => {
    const share = {
      kind: 'creature',
      data: {
        v: 1,
        name: 'Thistlewight',
        by: 'Nicola Mustone',
        creature: {
          id: 'custom:1',
          source: 'custom',
          name: 'Thistlewight',
          size: 'Medium',
          type: 'plant',
          alignment: 'unaligned',
          ac: 13,
          maxHp: 22,
          speed: { walk: 30 },
          abilities: { str: 12, dex: 14, con: 12, int: 6, wis: 10, cha: 6 },
          senses: { passivePerception: 10 },
          cr: 1,
          xp: 200,
          license: 'cc-by-sa-4.0',
        },
      },
    }
    expect(await describeShare(envWith(share), CODE, ORIGIN)).toMatchObject({
      kind: 'creature',
      name: 'Thistlewight',
      size: 'Medium',
      type: 'plant',
      cr: 1,
      xp: 200,
      license: 'cc-by-sa-4.0',
    })
  })

  // A reference carries no stat block, so both the type line and the licence come from
  // elsewhere: the sidecar for one, the library's own terms for the other.
  it('reads a referenced creature from the sidecar, licensed by its book', async () => {
    const share = { kind: 'creature', data: { v: 1, name: 'Goblin', ref: 'srd-5.2:goblin' } }
    expect(await describeShare(envWith(share), CODE, ORIGIN)).toMatchObject({
      name: 'Goblin',
      size: 'Small',
      type: 'humanoid',
      cr: 0.25,
      license: 'cc-by-4.0',
    })
  })

  it('falls back to the id for a creature no shipped library answers for', async () => {
    const share = {
      kind: 'encounter',
      data: {
        v: 1,
        name: 'From a book we do not ship',
        entries: [{ ref: 'some-future-book:bone-piper', count: 2, side: 'foe' }],
      },
    }
    const card = await describeShare(envWith(share), CODE, ORIGIN)
    expect(card && 'chips' in card && card.chips[0].name).toBe('Bone Piper')
    expect(assetPaths).toEqual([])
  })

  describe('every failure degrades to the generic shell', () => {
    it.each([
      ['a code that is not shaped like one', encounter, 'not a code!!', {}],
      ['a taken-down page', { ...encounter, taken_down: true }, CODE, {}],
      ['a code behind no row', null, CODE, {}],
      ['a kind this version has never heard of', { kind: 'campaign', data: {} }, CODE, {}],
      ['a payload that will not parse', { kind: 'encounter', data: { v: 1 } }, CODE, {}],
      [
        'an environment nobody set the variables in',
        encounter,
        CODE,
        { SUPABASE_URL: undefined, SUPABASE_ANON_KEY: undefined },
      ],
      [
        'a project carrying only half a credential',
        encounter,
        CODE,
        { SUPABASE_ANON_KEY: undefined },
      ],
    ])('returns null for %s', async (_case, row, code, overrides) => {
      expect(await describeShare(envWith(row, overrides), String(code), ORIGIN)).toBeNull()
    })

    it('returns null when the database is unreachable', async () => {
      const env = envWith(encounter)
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          throw new Error('no route to host')
        }),
      )
      expect(await describeShare(env, CODE, ORIGIN)).toBeNull()
    })

    it('returns null when the database answers with an error status', async () => {
      const env = envWith(encounter)
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response('nope', { status: 500 })),
      )
      expect(await describeShare(env, CODE, ORIGIN)).toBeNull()
    })
  })
})
