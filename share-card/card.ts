// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

import type { PublicationLicense } from '../console/src/publication/index.ts'

const BYLINE_MAX = 30
const LICENSE_LABELS: Record<PublicationLicense, string> = {
  'cc0-1.0': 'CC0 1.0',
  'cc-by-4.0': 'CC BY 4.0',
  'cc-by-sa-4.0': 'CC BY-SA 4.0',
  'cc-by-nc-4.0': 'CC BY-NC 4.0',
  'cc-by-nc-sa-4.0': 'CC BY-NC-SA 4.0',
  'ogl-1.0a': 'OGL 1.0a',
  reserved: 'All rights reserved',
  unstated: 'No public license stated',
}

/** Title-case one allowlisted type or alignment fact for card presentation. */
const titleCase = (value: string): string =>
  value.replace(/\b\w/g, (character) => character.toUpperCase())

/** Render the fractional challenge ratings used by published cards. */
export function formatCardChallenge(cr: number): string {
  if (cr === 0.125) return '1/8'
  if (cr === 0.25) return '1/4'
  if (cr === 0.5) return '1/2'
  return String(cr)
}

/**
 * What a `/s/<code>` link says about itself before anyone opens it.
 *
 * One shape for both kinds of share, built once and read twice: the Function swaps it into
 * the shell's meta tags, and the image route paints it. Keeping them off the same object is
 * how a card and its description come to disagree.
 */

/** One line of the cast, as the card prints it. */
export interface CastChip {
  name: string
  count: number
  side: 'friend' | 'foe'
}

export interface EncounterCard {
  kind: 'encounter'
  name: string
  /** Foes first, then friends, each in the order the publisher arranged them. */
  chips: CastChip[]
  /** Copies across the whole cast, which is not the number of chips. */
  creatures: number
  by?: string
  /** The publisher's own words: the name, the note, the arrangement. Never the creatures. */
  license?: PublicationLicense
}

export interface CreatureCard {
  kind: 'creature'
  name: string
  size?: string
  type?: string
  alignment?: string
  cr?: number
  xp?: number
  by?: string
  /** The stat block's own, which is a different claim from the encounter's. */
  license?: PublicationLicense
}

export type ShareCard = EncounterCard | CreatureCard

/**
 * Cut a byline to what the card's footer holds, marking the cut.
 *
 * The publish form and the parser both hold a byline to `BYLINE_MAX`, so this never fires on
 * anything published through the console. It is here for a row written straight into the
 * database, which `lib/byline.ts` says plainly is possible: the licence has to stay visible
 * whatever somebody typed.
 */
export function clipByline(by: string | undefined): string | undefined {
  const text = by?.trim()
  if (!text) return undefined
  return text.length <= BYLINE_MAX ? text : `${text.slice(0, BYLINE_MAX - 1).trimEnd()}…`
}

/**
 * The licence label, or nothing.
 *
 * `unstated` prints nothing at all. An absent licence is nobody having said, and a line
 * reading "No public license stated" is noise dressed as information.
 */
export function licenseLabel(license: PublicationLicense | undefined): string | undefined {
  return !license || license === 'unstated' ? undefined : LICENSE_LABELS[license]
}

/** The stat block's own first line: "Small Humanoid, Chaotic Neutral". */
export function typeLine(card: CreatureCard): string | undefined {
  if (!card.size && !card.type) return undefined
  const kind = [card.size, card.type ? titleCase(card.type) : undefined].filter(Boolean).join(' ')
  return card.alignment ? `${kind}, ${titleCase(card.alignment)}` : kind
}

/** A chip's label: "4× Goblin", and "Bugbear Chief" where there is only one of it. */
export function chipLabel(chip: CastChip): string {
  return chip.count > 1 ? `${chip.count}× ${chip.name}` : chip.name
}

/** The kicker above the card, and the only thing that says which kind of share this is. */
export function kicker(card: ShareCard): string {
  return card.kind === 'encounter' ? 'SHARED ENCOUNTER' : 'SHARED CREATURE'
}

/** "Shared by X · CC BY 4.0", with either half dropping out on its own. */
export function bylineLine(card: ShareCard): { by?: string; license?: string } {
  return { by: clipByline(card.by), license: licenseLabel(card.license) }
}

const plural = (n: number, one: string): string => `${n} ${one}${n === 1 ? '' : 's'}`

/**
 * What a chat window prints under the title.
 *
 * Never the note. It is the Game Master's words to a specific reader, and the one field
 * where a scanner following the link out of a chat log would learn what that reader was
 * sent rather than what the publisher chose to publish.
 */
export function cardDescription(card: ShareCard): string {
  const { by } = bylineLine(card)
  const credit = by ? ` Shared by ${by}.` : ''
  if (card.kind === 'encounter') {
    return `${plural(card.creatures, 'creature')} across ${plural(card.chips.length, 'kind')}.${credit}`
  }
  const line = typeLine(card)
  const challenge = card.cr == null ? '' : ` Challenge ${formatCardChallenge(card.cr)}.`
  return `${line ? `${line}.` : ''}${challenge}${credit}`.trim()
}

/**
 * What the picture shows, for a reader who cannot see it.
 *
 * It also carries the one thing the card itself has no room to say: an encounter's licence
 * covers the publisher's own words, and a creature's covers the stat block. Both are the
 * right thing to print, and a reader who needs the difference is reading this.
 */
export function cardImageAlt(card: ShareCard): string {
  const { by, license } = bylineLine(card)
  const parts: string[] = []
  if (card.kind === 'encounter') {
    parts.push(`An OpenFray link card for a shared DnD 5e encounter: ${card.name}`)
    if (card.chips.length) parts.push(`Cast: ${card.chips.map(chipLabel).join(', ')}`)
  } else {
    parts.push(`An OpenFray link card for a shared DnD 5e stat block: ${card.name}`)
    const line = typeLine(card)
    if (line) parts.push(line)
    if (card.cr != null) parts.push(`Challenge ${formatCardChallenge(card.cr)}`)
  }
  if (by) parts.push(`Shared by ${by}`)
  if (license) {
    parts.push(
      card.kind === 'encounter'
        ? `${license}, which covers the publisher's own words and not the creatures`
        : `${license}, which covers the stat block`,
    )
  }
  return `${parts.join('. ')}.`
}
