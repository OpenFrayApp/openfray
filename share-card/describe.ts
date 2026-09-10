// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

import {
  isPublicationShareCode,
  normalizePublication,
  publicationSources,
  resolvePublicationPreview,
  type PublicationPreview,
} from '../console/src/publication/index.ts'
import type { CastChip, ShareCard } from './card.ts'

/**
 * Read one published share at the edge and reduce it through the console-owned contract.
 * Every failure returns null so the assembled route keeps its generic HTTP 200 shell.
 */

/** The project variables and static-asset binding available to the Pages Function. */
export interface CardEnv {
  SUPABASE_URL?: string
  SUPABASE_ANON_KEY?: string
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_ANON_KEY?: string
  ASSETS: { fetch(input: RequestInfo | URL): Promise<Response> }
}

/** Read the project credentials under either supported spelling. */
function credentials(env: CardEnv): { url: string; key: string } | null {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL
  const key = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY
  return url && key ? { url, key } : null
}

/** Fetch one row through the database's bounded security-definer function. */
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
  const value: unknown = await response.json()
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  if (row.taken_down === true) return null
  if (typeof row.kind !== 'string' || row.data === undefined) return null
  return { kind: row.kind, data: row.data }
}

/** Fetch only the source indexes declared by the normalized publication. */
async function loadSourceIndexes(
  env: CardEnv,
  origin: string,
  sources: readonly { id: string; indexPath: string }[],
): Promise<Record<string, unknown>> {
  const indexes: Record<string, unknown> = Object.create(null) as Record<string, unknown>
  await Promise.all(
    sources.map(async (source) => {
      const response = await env.ASSETS.fetch(
        new URL(`/console/compendium/${source.indexPath}`, origin),
      )
      if (response.ok) indexes[source.id] = await response.json()
    }),
  )
  return indexes
}

/** Turn presentation-neutral publication facts into the card renderer's shape. */
function cardFromPreview(preview: PublicationPreview): ShareCard {
  if (preview.kind === 'creature') return preview
  const chips = preview.cast.map((fact): CastChip => ({ ...fact }))
  return {
    kind: 'encounter',
    name: preview.name,
    chips: [
      ...chips.filter((chip) => chip.side === 'foe'),
      ...chips.filter((chip) => chip.side === 'friend'),
    ],
    creatures: preview.creatures,
    ...(preview.by ? { by: preview.by } : {}),
    ...(preview.license ? { license: preview.license } : {}),
  }
}

/** Describe one valid publication, or choose the generic route fallback. */
export async function describeShare(
  env: CardEnv,
  code: string,
  origin: string,
): Promise<ShareCard | null> {
  try {
    if (!isPublicationShareCode(code)) return null
    const row = await readShare(env, code)
    if (!row) return null
    const normalized = normalizePublication(row)
    if (normalized.status !== 'ok') return null
    const indexes = await loadSourceIndexes(env, origin, publicationSources(normalized.publication))
    const resolved = resolvePublicationPreview(normalized.publication, indexes)
    return resolved.status === 'ok' ? cardFromPreview(resolved.preview) : null
  } catch {
    return null
  }
}
