// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

import { parseTemplate } from '../console/src/combat/encounterTemplate.ts'
import { parseCreatureTemplate } from '../console/src/combat/creatureTemplate.ts'
import { isShareCode } from '../console/src/state/shareCode.ts'
import { LIBRARIES } from '../console/src/compendium/libraries.ts'
import { effectiveLicense, licenseOfSource } from '../console/src/schema/license.ts'
import { indexFileFor, type CompendiumIndexEntry } from '../scripts/compendium-index.mjs'
import type { CastChip, ShareCard } from './card.ts'

/**
 * Reading a published share from the edge, to describe it to whatever unfurls the link.
 *
 * Every failure here returns null, and null means the shell answers exactly as it did
 * before any of this existed: the generic card, the site banner, HTTP 200. A missing code, a
 * taken-down page, a Supabase that is asleep, an environment variable nobody set, a payload
 * this version cannot read — all the same answer, because the alternative is a link that
 * fails to unfurl rather than one that unfurls plainly.
 */

/**
 * What the Function is handed: the project's environment variables, and the asset server.
 *
 * Both spellings are read. Pages hands a Function every variable the project declares,
 * whatever it is called, and the `VITE_` prefix is only Vite's instruction about which ones
 * to bake into the client bundle at build time. The console already declares the prefixed
 * pair, so reading either means the card works without a second copy of the same two values
 * sitting in the project settings waiting to disagree with the first.
 */
export interface CardEnv {
  SUPABASE_URL?: string
  SUPABASE_ANON_KEY?: string
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_ANON_KEY?: string
  ASSETS: { fetch(input: RequestInfo | URL): Promise<Response> }
}

/** The project's Supabase credentials under either name, or null if neither is set. */
function credentials(env: CardEnv): { url: string; key: string } | null {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL
  const key = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY
  return url && key ? { url, key } : null
}

/**
 * The share row, through the same security-definer function the client calls. No select
 * policy, no new database surface: a policy letting a stranger read one row by code lets
 * them list every row.
 */
async function readShare(
  env: CardEnv,
  code: string,
): Promise<{ kind: string; data: unknown } | null> {
  const supabase = credentials(env)
  if (!supabase) return null
  const response = await fetch(`${supabase.url}/rest/v1/rpc/share`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: supabase.key,
      authorization: `Bearer ${supabase.key}`,
    },
    body: JSON.stringify({ want: code }),
  })
  if (!response.ok) return null
  const row = (await response.json()) as {
    kind?: unknown
    data?: unknown
    taken_down?: unknown
  } | null
  if (!row || typeof row !== 'object') return null
  // A page a moderator removed gets no card. It is still served, and it still says nothing
  // about what used to be behind the code.
  if (row.taken_down === true) return null
  if (typeof row.kind !== 'string' || row.data === undefined) return null
  return { kind: row.kind, data: row.data }
}

/**
 * The library a compendium id belongs to, matched against the shipped list rather than
 * split off the string: what the card needs is the book, and an id naming no book we ship
 * has no index to read and no licence to state.
 */
function libraryOf(id: string) {
  return LIBRARIES.find((l) => id.startsWith(`${l.id}:`))
}

/** The sidecar indexes for the libraries a cast actually names, merged into one lookup. */
async function loadIndexes(env: CardEnv, origin: string, ids: readonly string[]) {
  const libraries = new Set(ids.map(libraryOf).filter((l) => l?.creaturesFile))
  const files = [...libraries].map((l) => indexFileFor(l!.creaturesFile!))
  const found = new Map<string, CompendiumIndexEntry>()
  await Promise.all(
    files.map(async (file) => {
      const url = new URL(`/console/compendium/${file}`, origin)
      const response = await env.ASSETS.fetch(url)
      if (!response.ok) return
      const index = (await response.json()) as Record<string, CompendiumIndexEntry>
      for (const [id, entry] of Object.entries(index)) found.set(id, entry)
    }),
  )
  return found
}

/**
 * A readable name for a creature no index answers for — a library this deploy does not
 * ship. Better on a card than "Unknown creature", and it is what the id was made from.
 */
function nameFromRef(ref: string): string {
  const slug = ref.slice(ref.indexOf(':') + 1)
  return slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/** The cast as chips: foes first, then friends, each in the order they were arranged. */
function castChips(
  entries: readonly {
    ref?: string
    creature?: { name: string }
    quick?: { name: string }
    count: number
    side: 'friend' | 'foe'
  }[],
  index: Map<string, CompendiumIndexEntry>,
): CastChip[] {
  const chips = entries.map((entry): CastChip => {
    const name =
      entry.quick?.name ??
      entry.creature?.name ??
      (entry.ref ? (index.get(entry.ref)?.name ?? nameFromRef(entry.ref)) : 'Creature')
    return { name, count: entry.count, side: entry.side }
  })
  return [...chips.filter((c) => c.side === 'foe'), ...chips.filter((c) => c.side === 'friend')]
}

/**
 * What a library creature is published under. Its book answers for it: no creature in any
 * shipped library carries a licence of its own, and one that did would be carried whole
 * rather than referenced.
 */
function licenseOfRef(ref: string | undefined) {
  const library = ref ? libraryOf(ref) : undefined
  return library ? licenseOfSource(library.id) : undefined
}

/** What the link is, or null to leave the generic shell alone. */
export async function describeShare(
  env: CardEnv,
  code: string,
  origin: string,
): Promise<ShareCard | null> {
  try {
    if (!isShareCode(code)) return null
    const share = await readShare(env, code)
    if (!share) return null

    // `kind` is a namespace rather than a closed set: a kind this deploy has never heard of
    // falls through to the generic shell instead of erroring.
    if (share.kind === 'encounter') {
      const { template } = parseTemplate(share.data)
      if (!template) return null
      const refs = template.entries.map((e) => e.ref).filter((r): r is string => !!r)
      const index = await loadIndexes(env, origin, refs)
      return {
        kind: 'encounter',
        name: template.name,
        chips: castChips(template.entries, index),
        creatures: template.entries.reduce((n, e) => n + e.count, 0),
        by: template.by,
        license: template.license,
      }
    }

    if (share.kind === 'creature') {
      const { template } = parseCreatureTemplate(share.data)
      if (!template) return null
      // Carried whole, or a reference the reader's own compendium resolves. Either way the
      // name is the template's: a `ref` share has no stat block here to read one from.
      const carried = template.creature
      const entry = template.ref
        ? (await loadIndexes(env, origin, [template.ref])).get(template.ref)
        : undefined
      const from = carried ?? entry
      return {
        kind: 'creature',
        name: template.name,
        size: from?.size,
        type: from?.type,
        alignment: from?.alignment,
        cr: from?.cr,
        // A shared stat block is not in a lair, so `xpLair` is never the award to print.
        xp: from?.xp,
        by: template.by,
        license: carried ? effectiveLicense(carried) : licenseOfRef(template.ref),
      }
    }

    return null
  } catch {
    return null
  }
}
