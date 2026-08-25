// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

// Sidecar indexes for the compendium: one small file per library holding the few
// fields a link preview needs, next to the library it summarises.
//
// A Pages Function drawing a share card has to turn `srd-5.2:goblin` into a name, and
// neither of the obvious ways works. Bundling a compiled map into the Worker grows the
// bundle with every book (5.2MB of creature JSON across eight libraries today), and
// parsing a 1.1MB book at request time to read four names spends the CPU budget on
// nothing. An index is a few tens of kilobytes, is a static asset like the book beside
// it, and is already cached for a day by `_headers`. Ten more books means ten more
// sidecars and a byte-identical Function.
//
// Nothing here touches the file system, because the Function imports it: a `node:fs` in
// this module is a `node:fs` in the Worker. `assemble-site.mjs` does the writing.

/** The suffix every library of stat blocks carries, and the one the sidecar takes. */
export const CREATURES_SUFFIX = '-creatures.json'
const INDEX_SUFFIX = '-creatures.index.json'

/**
 * What a card can say about a creature it only holds an id for. Nothing else: the index
 * is read to write four words on a picture, not to render a stat block.
 */
function entryOf(creature) {
  const entry = { name: creature.name, size: creature.size, type: creature.type }
  if (creature.alignment) entry.alignment = creature.alignment
  if (creature.cr != null) entry.cr = creature.cr
  if (creature.xp != null) entry.xp = creature.xp
  return entry
}

/** Every id in one library, mapped to what a card needs. */
export function indexCreatures(creatures) {
  const index = {}
  for (const creature of creatures) index[creature.id] = entryOf(creature)
  return index
}

/** The sidecar beside a library file, e.g. `srd-creatures.json` → `srd-creatures.index.json`. */
export function indexFileFor(creaturesFile) {
  return creaturesFile.endsWith(CREATURES_SUFFIX)
    ? creaturesFile.slice(0, -CREATURES_SUFFIX.length) + INDEX_SUFFIX
    : creaturesFile
}
