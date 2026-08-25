// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

import { formatCr } from '../console/src/compendium/format.ts'
import {
  bylineLine,
  chipLabel,
  kicker,
  typeLine,
  type CastChip,
  type CreatureCard,
  type EncounterCard,
  type ShareCard,
} from './card.ts'

/**
 * The picture a `/s/<code>` link unfurls with, as the element tree satori lays out.
 *
 * The banner's job is to say "OpenFray"; this card's job is to say "this specific
 * encounter", which is why the wordmark is small and cornered and the name is the largest
 * thing on it. The kicker is the only element that distinguishes the two kinds at a glance,
 * and it replaces the banner's tagline: "A DnD 5e combat console for Game Masters" is the
 * wrong sentence on a link to one fight.
 *
 * Nothing load-bearing sits in a corner. WhatsApp and some Slack layouts shrink the card to
 * a near-square thumbnail and lose the left and right edges; the title and the cast sit
 * centre-left and survive every crop, and the call to action and the kicker are the
 * expendable elements on purpose.
 *
 * Built as objects rather than as an HTML string. `workers-og` will parse a string, with
 * `HTMLRewriter` and its own warning that the result is error-prone, and it silently drops
 * the style of every nested element — which satori then refuses, because a flex container
 * it cannot see has too many children. Satori's own input is this shape.
 *
 * Satori is flexbox, not a canvas, so this is a tree carrying the reviewed sizes and
 * paddings rather than the coordinates the design was drawn at.
 */

export const CARD_WIDTH = 1200
export const CARD_HEIGHT = 630

/** Every value is the brand banner's or the console's own. Nothing here is new. */
const COLOR = {
  ground: '#020617',
  accent: '#818cf8',
  bright: '#e2e8f0',
  chip: '#cbd5e1',
  muted: '#94a3b8',
  faint: '#64748b',
  rule: '#334155',
  chipEdge: '#1e293b',
  foe: '#fda4af',
  friend: '#6ee7b7',
  cta: '#4f46e5',
} as const

/** What satori reads: a tag, a style, and children. The same shape React would hand it. */
export interface CardNode {
  type: string
  props: Record<string, unknown>
}

type Child = CardNode | string | undefined | false

/**
 * One element of the tree, with the empty children dropped.
 *
 * `display: flex` unless the caller says otherwise, because satori refuses any div it has to
 * lay out that has not declared one. That includes a div drawn purely as a shape: the cast's
 * side dots hold nothing and threw the same error a full container does.
 */
function el(type: string, style: Record<string, string | number>, ...children: Child[]): CardNode {
  const kept = children.filter((c): c is CardNode | string => !!c)
  return {
    type,
    props: { style: { display: 'flex', ...style }, children: kept.length === 1 ? kept[0] : kept },
  }
}

/** A row, which is what almost everything on the card is. */
const row = (style: Record<string, string | number>, ...children: Child[]): CardNode =>
  el('div', { alignItems: 'center', ...style }, ...children)

/** A run of text. Satori sizes it; nothing here measures. */
const text = (style: Record<string, string | number>, value: string): CardNode =>
  el('div', style, value)

/** The crossed swords, the same 24-unit paths the brand banner draws. */
const SWORDS =
  'M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2M14.5 6.5 18 3h3v3l-3.5 3.5M5 14l4 4M7 17l-3 3M3 19l2 2'

const MARK = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${COLOR.accent}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="${SWORDS}"/></svg>`

/**
 * How wide a chip's label will come out, near enough to decide what fits.
 *
 * Satori measures the text itself when it lays the row out; this only has to decide where to
 * stop packing, and Inter's lowercase averages a little over half its size.
 */
const CHIP_PADDING = 72
const chipWidth = (chip: CastChip): number => CHIP_PADDING + chipLabel(chip).length * 15.4

/** The row a cast fits into before it would run under the right-hand padding. */
const CAST_ROW = 985
const CAST_GAP = 16

/** Room for "+12 more", the widest the count of what did not fit can be. */
const MORE_CHIP = CHIP_PADDING + 9 * 15.4

/**
 * As many of the cast as fit, and how many were left. Foes come first, so what is cut is
 * the tail of the friendly side, which is the half a reader can most afford to lose.
 */
export function packCast(chips: readonly CastChip[]): { shown: CastChip[]; more: number } {
  const widths = chips.map(chipWidth)
  const shown: CastChip[] = []
  let used = 0
  for (const [i, chip] of chips.entries()) {
    const width = widths[i] + (shown.length ? CAST_GAP : 0)
    if (used + width > CAST_ROW) break
    used += width
    shown.push(chip)
  }
  // The count of what was left has to fit too, so the last chip gives way rather than being
  // followed by a "+N more" that runs off the row.
  while (
    shown.length > 1 &&
    shown.length < chips.length &&
    used + CAST_GAP + MORE_CHIP > CAST_ROW
  ) {
    used -= widths[shown.length - 1] + CAST_GAP
    shown.pop()
  }
  return { shown, more: chips.length - shown.length }
}

/** One creature of the cast: a side dot and a label, or the count of what did not fit. */
function chip(label: string, tone?: string): CardNode {
  return row(
    {
      height: '58px',
      borderRadius: '14px',
      padding: '0 24px 0 26px',
      backgroundColor: tone ? 'rgba(148,163,184,0.07)' : 'rgba(148,163,184,0.04)',
      border: `1px solid ${COLOR.chipEdge}`,
      flexShrink: 0,
    },
    tone &&
      el('div', {
        width: '11px',
        height: '11px',
        borderRadius: '11px',
        backgroundColor: tone,
        marginRight: '11px',
      }),
    text({ fontSize: '28px', fontWeight: 500, color: tone ? COLOR.chip : COLOR.faint }, label),
  )
}

/** The cast as a single row, cut where it would run past the padding. */
function cast(chips: readonly CastChip[]): CardNode {
  const { shown, more } = packCast(chips)
  return row(
    { gap: `${CAST_GAP}px`, marginTop: '30px' },
    ...shown.map((c) => chip(chipLabel(c), c.side === 'foe' ? COLOR.foe : COLOR.friend)),
    more > 0 && chip(`+${more} more`),
  )
}

/** One of the two numbers on a creature card: a small shouted label over a large value. */
function stat(label: string, value: string): CardNode {
  return el(
    'div',
    { display: 'flex', flexDirection: 'column', marginRight: '76px' },
    text({ fontSize: '20px', fontWeight: 600, letterSpacing: '3.5px', color: COLOR.faint }, label),
    text({ fontSize: '50px', fontWeight: 800, color: COLOR.bright, marginTop: '14px' }, value),
  )
}

/**
 * The name, on one line where it fits and two where it does not.
 *
 * `TEMPLATE_LIMITS.name` is 60 characters, so two lines always suffice and there is no
 * ellipsis case to build.
 */
function title(name: string, oneLine: number, twoLine: number): CardNode {
  const long = name.length > 26
  return text(
    {
      fontSize: `${long ? twoLine : oneLine}px`,
      fontWeight: 800,
      letterSpacing: long ? '-1.8px' : '-2.5px',
      color: COLOR.bright,
      lineHeight: 1.12,
      maxWidth: '1056px',
    },
    name,
  )
}

/** The wordmark and the kicker, the one line both kinds of card share. */
function header(card: ShareCard): CardNode {
  return row(
    { justifyContent: 'space-between' },
    row(
      {},
      {
        type: 'img',
        props: {
          width: 37,
          height: 37,
          src: `data:image/svg+xml;utf8,${encodeURIComponent(MARK)}`,
          style: { display: 'flex' },
        },
      },
      row(
        { fontSize: '30px', fontWeight: 800, letterSpacing: '-0.5px', marginLeft: '19px' },
        text({ color: COLOR.accent }, 'Open'),
        text({ color: COLOR.bright }, 'Fray'),
      ),
    ),
    text(
      { fontSize: '21px', fontWeight: 600, letterSpacing: '4.5px', color: COLOR.faint },
      kicker(card),
    ),
  )
}

/**
 * The byline and the licence, one plain line, and the call to action.
 *
 * No badge and no pill on the left: a licence reads like the byline because it is the same
 * kind of fact. With a licence and no byline the licence stands alone, and with neither the
 * slot is empty. There is no "Shared by Anonymous".
 *
 * The button is not a control and receives no click, but the whole embed is one link in
 * every client that renders these, so pressing it does exactly what it says. It also
 * replaces the address line, which every one of those clients prints as embed chrome
 * anyway.
 */
function footer(card: ShareCard): CardNode {
  const { by, license } = bylineLine(card)
  const line = { fontSize: '26px', color: COLOR.faint }
  return row(
    { justifyContent: 'space-between' },
    row(
      {},
      by && text(line, `Shared by ${by}`),
      by && license && text({ fontSize: '26px', color: COLOR.rule, padding: '0 12px' }, '·'),
      license && text(line, license),
    ),
    text(
      {
        alignItems: 'center',
        justifyContent: 'center',
        width: '353px',
        height: '56px',
        borderRadius: '11px',
        backgroundColor: COLOR.cta,
        fontSize: '26px',
        fontWeight: 600,
        color: '#ffffff',
        flexShrink: 0,
      },
      'Use this at your table',
    ),
  )
}

/** The cast, under the encounter's name. */
function encounterBody(card: EncounterCard): CardNode[] {
  return [title(card.name, 78, 60), card.chips.length ? cast(card.chips) : undefined].filter(
    (n): n is CardNode => !!n,
  )
}

/**
 * The type line and the two numbers, under the creature's name.
 *
 * A stat block saved without a challenge rating drops the whole row: `formatCr` answers an
 * em dash, which is right on a stat block and looks broken on a card. The award is only ever
 * the plain one, never `xpLair` — a shared stat block is not in its lair.
 */
function creatureBody(card: CreatureCard): CardNode[] {
  const line = typeLine(card)
  const nodes: CardNode[] = [title(card.name, 66, 56)]
  if (line) {
    nodes.push(
      text({ fontSize: '30px', fontStyle: 'italic', color: COLOR.muted, marginTop: '18px' }, line),
    )
  }
  if (card.cr != null) {
    nodes.push(
      row(
        { marginTop: '44px', alignItems: 'flex-start' },
        stat('CHALLENGE', formatCr(card.cr)),
        card.xp != null && stat('XP', card.xp.toLocaleString('en-US')),
      ),
    )
  }
  return nodes
}

/** The whole card, as the tree satori is handed. */
export function cardTree(card: ShareCard): CardNode {
  const body = card.kind === 'encounter' ? encounterBody(card) : creatureBody(card)
  return el(
    'div',
    {
      flexDirection: 'column',
      width: `${CARD_WIDTH}px`,
      height: `${CARD_HEIGHT}px`,
      padding: '72px',
      backgroundColor: COLOR.ground,
      backgroundImage:
        'radial-gradient(78% 78% at 50% 0%, rgba(99,102,241,0.30) 0%, rgba(99,102,241,0) 65%)',
      fontFamily: 'Inter',
    },
    header(card),
    el('div', { flexDirection: 'column', flexGrow: 1, justifyContent: 'center' }, ...body),
    footer(card),
  )
}
