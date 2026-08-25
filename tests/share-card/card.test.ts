// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

import { describe, expect, it } from 'vitest'
import {
  cardDescription,
  cardImageAlt,
  chipLabel,
  clipByline,
  kicker,
  licenseLabel,
  typeLine,
  type CreatureCard,
  type EncounterCard,
} from '../../share-card/card.ts'
import { BYLINE_MAX } from '../../console/src/lib/byline.ts'

const ambush: EncounterCard = {
  kind: 'encounter',
  name: 'Ambush at the ford',
  chips: [
    { name: 'Goblin', count: 4, side: 'foe' },
    { name: 'Bugbear Chief', count: 1, side: 'foe' },
  ],
  creatures: 5,
  by: 'Nicola Mustone',
  license: 'cc-by-4.0',
}

const goblin: CreatureCard = {
  kind: 'creature',
  name: 'Goblin',
  size: 'Small',
  type: 'humanoid',
  alignment: 'chaotic neutral',
  cr: 0.25,
  xp: 50,
  license: 'cc-by-4.0',
}

describe('the shared card', () => {
  it('says which of the two kinds it is, and nothing else does', () => {
    expect(kicker(ambush)).toBe('SHARED ENCOUNTER')
    expect(kicker(goblin)).toBe('SHARED CREATURE')
  })

  it('drops the multiplier where there is only one of something', () => {
    expect(chipLabel({ name: 'Goblin', count: 4, side: 'foe' })).toBe('4× Goblin')
    expect(chipLabel({ name: 'Bugbear Chief', count: 1, side: 'foe' })).toBe('Bugbear Chief')
  })

  it('reads a type line the way a stat block does', () => {
    expect(typeLine(goblin)).toBe('Small Humanoid, Chaotic Neutral')
    expect(typeLine({ ...goblin, alignment: undefined })).toBe('Small Humanoid')
    expect(typeLine({ kind: 'creature', name: 'Nameless' })).toBeUndefined()
  })

  // An absent licence is nobody having said. Printing a sentence about that is noise
  // dressed as information, so the slot stays empty.
  it('prints nothing at all for an unstated licence', () => {
    expect(licenseLabel('cc-by-4.0')).toBe('CC BY 4.0')
    expect(licenseLabel('unstated')).toBeUndefined()
    expect(licenseLabel(undefined)).toBeUndefined()
  })

  // The form and the parser both stop at BYLINE_MAX, so this only ever fires on a row
  // written straight into the database. The licence has to survive whatever was typed.
  it('cuts a byline rather than letting it push the licence off the line', () => {
    expect(clipByline('  Nicola Mustone  ')).toBe('Nicola Mustone')
    expect(clipByline('')).toBeUndefined()
    const long = clipByline('a'.repeat(60))
    expect(long).toHaveLength(BYLINE_MAX)
    expect(long?.endsWith('…')).toBe(true)
  })

  describe('the description a chat window prints', () => {
    it('counts an encounter, and credits whoever published it', () => {
      expect(cardDescription(ambush)).toBe('5 creatures across 2 kinds. Shared by Nicola Mustone.')
    })

    it('says a cast of one in the singular', () => {
      expect(
        cardDescription({
          kind: 'encounter',
          name: 'One ogre',
          chips: [{ name: 'Ogre', count: 1, side: 'foe' }],
          creatures: 1,
        }),
      ).toBe('1 creature across 1 kind.')
    })

    it('gives a creature its type line and its challenge, as a fraction', () => {
      expect(cardDescription(goblin)).toBe('Small Humanoid, Chaotic Neutral. Challenge 1/4.')
    })

    it('leaves the challenge out when the stat block has none', () => {
      expect(cardDescription({ ...goblin, cr: undefined })).toBe('Small Humanoid, Chaotic Neutral.')
    })

    // The one field where a scanner following a link out of a chat log would learn what the
    // reader was sent rather than what the publisher chose to publish.
    it('never carries the note', () => {
      const note = 'The chief opens by shoving the smallest goblin into the ford.'
      const described = cardDescription({ ...ambush, ...({ note } as object) })
      expect(described).not.toContain('ford')
    })
  })

  describe('the alt text', () => {
    it('describes the encounter card, and says whose words its licence covers', () => {
      expect(cardImageAlt(ambush)).toBe(
        'An OpenFray link card for a shared DnD 5e encounter: Ambush at the ford. ' +
          'Cast: 4× Goblin, Bugbear Chief. Shared by Nicola Mustone. ' +
          "CC BY 4.0, which covers the publisher's own words and not the creatures.",
      )
    })

    it('describes the creature card, whose licence covers the stat block instead', () => {
      expect(cardImageAlt(goblin)).toBe(
        'An OpenFray link card for a shared DnD 5e stat block: Goblin. ' +
          'Small Humanoid, Chaotic Neutral. Challenge 1/4. ' +
          'CC BY 4.0, which covers the stat block.',
      )
    })

    it('leaves out the halves it has nothing for', () => {
      expect(cardImageAlt({ kind: 'creature', name: 'Thing' })).toBe(
        'An OpenFray link card for a shared DnD 5e stat block: Thing.',
      )
    })
  })
})
