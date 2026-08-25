// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

import { describe, expect, it } from 'vitest'
import {
  cardTree,
  packCast,
  CARD_HEIGHT,
  CARD_WIDTH,
  type CardNode,
} from '../../share-card/image.ts'
import type { CastChip, CreatureCard, EncounterCard } from '../../share-card/card.ts'

const foes = (n: number): CastChip[] =>
  Array.from({ length: n }, (_, i) => ({ name: `Creature ${i + 1}`, count: i + 1, side: 'foe' }))

const encounter = (chips: CastChip[]): EncounterCard => ({
  kind: 'encounter',
  name: 'Ambush at the ford',
  chips,
  creatures: chips.reduce((n, c) => n + c.count, 0),
  by: 'Nicola Mustone',
  license: 'cc-by-4.0',
})

const goblin: CreatureCard = {
  kind: 'creature',
  name: 'Goblin Warrior',
  size: 'Small',
  type: 'fey (goblinoid)',
  alignment: 'chaotic neutral',
  cr: 0.25,
  xp: 50,
  license: 'cc-by-4.0',
}

/** Every node in the tree, depth first. */
function nodes(node: CardNode, found: CardNode[] = []): CardNode[] {
  found.push(node)
  const children = node.props.children
  const list = Array.isArray(children) ? children : children === undefined ? [] : [children]
  for (const child of list) if (typeof child === 'object' && child) nodes(child as CardNode, found)
  return found
}

/** Every string the tree will print. */
const words = (node: CardNode): string[] =>
  nodes(node).flatMap((n) => {
    const children = n.props.children
    const list = Array.isArray(children) ? children : [children]
    return list.filter((c): c is string => typeof c === 'string')
  })

describe('the card image', () => {
  // Satori refuses any div it lays out that has not declared a display, and the message it
  // throws names no element. It cost an afternoon twice; this is the guard.
  it.each([
    ['an encounter', cardTree(encounter(foes(3)))],
    ['a cast of one', cardTree(encounter(foes(1)))],
    ['a cast that overruns', cardTree(encounter(foes(12)))],
    ['a creature', cardTree(goblin)],
    ['a creature with no challenge rating', cardTree({ ...goblin, cr: undefined })],
    ['a card with nothing in its footer', cardTree({ kind: 'creature', name: 'Thing' })],
  ])('declares a display on every element of %s', (_case, tree) => {
    for (const node of nodes(tree)) {
      expect((node.props.style as Record<string, unknown>).display).toBe('flex')
    }
  })

  it('is exactly the size the shell declares', () => {
    const style = cardTree(goblin).props.style as Record<string, string>
    expect(style.width).toBe(`${CARD_WIDTH}px`)
    expect(style.height).toBe(`${CARD_HEIGHT}px`)
  })

  describe('packing the cast', () => {
    it('shows everything that fits, and counts nothing', () => {
      expect(packCast(foes(3))).toEqual({ shown: foes(3), more: 0 })
    })

    it('stops before the row overruns, and counts what is left', () => {
      const { shown, more } = packCast(foes(12))
      expect(shown.length).toBeGreaterThan(0)
      expect(shown.length).toBeLessThan(12)
      expect(more).toBe(12 - shown.length)
    })

    // A "+N more" that itself runs off the row is the bug this guards: the last chip gives
    // way instead.
    it('leaves room for the count it appends', () => {
      const wide: CastChip[] = [
        { name: 'A creature with a very long name indeed', count: 2, side: 'foe' },
        { name: 'Another creature with a long name', count: 3, side: 'foe' },
        { name: 'A third', count: 1, side: 'friend' },
      ]
      const { shown, more } = packCast(wide)
      expect(more).toBeGreaterThan(0)
      expect(shown.length).toBeLessThan(wide.length)
    })
  })

  describe('what ends up on it', () => {
    it('names the kind, the encounter, its cast and its byline', () => {
      const printed = words(
        cardTree(encounter([{ name: 'Goblin Warrior', count: 4, side: 'foe' }])),
      )
      expect(printed).toContain('SHARED ENCOUNTER')
      expect(printed).toContain('Ambush at the ford')
      expect(printed).toContain('4× Goblin Warrior')
      expect(printed).toContain('Shared by Nicola Mustone')
      expect(printed).toContain('CC BY 4.0')
      expect(printed).toContain('Use this at your table')
    })

    it('gives a creature its type line and both numbers', () => {
      const printed = words(cardTree(goblin))
      expect(printed).toContain('SHARED CREATURE')
      expect(printed).toContain('Small Fey (Goblinoid), Chaotic Neutral')
      expect(printed).toContain('CHALLENGE')
      expect(printed).toContain('1/4')
      expect(printed).toContain('XP')
      expect(printed).toContain('50')
    })

    // `formatCr` answers an em dash, which is right on a stat block and looks broken here.
    it('drops the whole stat row when the stat block has no challenge rating', () => {
      const printed = words(cardTree({ ...goblin, cr: undefined, xp: undefined }))
      expect(printed).not.toContain('CHALLENGE')
      expect(printed).not.toContain('—')
    })

    it('shows the challenge alone when there is no award', () => {
      const printed = words(cardTree({ ...goblin, xp: undefined }))
      expect(printed).toContain('CHALLENGE')
      expect(printed).not.toContain('XP')
    })

    it('leaves the footer empty rather than inventing a publisher', () => {
      const printed = words(cardTree({ kind: 'creature', name: 'Thing' }))
      expect(printed.some((w) => w.startsWith('Shared by'))).toBe(false)
      expect(printed).not.toContain('No public license stated')
    })

    it('never prints the note', () => {
      const withNote = { ...encounter(foes(2)), note: 'The chief shoves a goblin into the ford' }
      expect(words(cardTree(withNote as EncounterCard)).join(' ')).not.toContain('chief')
    })
  })
})
