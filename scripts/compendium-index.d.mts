// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

/** One creature as a sidecar index holds it: what a link preview card can print, and no more. */
export interface CompendiumIndexEntry {
  name: string
  size?: string
  type?: string
  alignment?: string
  cr?: number
  xp?: number
}

/** A library's sidecar, keyed by compendium id. */
export type CompendiumIndex = Record<string, CompendiumIndexEntry>

export const CREATURES_SUFFIX: string
export function indexCreatures(creatures: readonly unknown[]): CompendiumIndex
export function indexFileFor(creaturesFile: string): string
