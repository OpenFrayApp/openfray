// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

import {
  isPublicationShareCode,
  normalizePublication,
  publicationSources,
  resolvePublicationPreview,
  type PublicationPreview,
} from '../console/src/publication/index.ts'
import {
  PUBLIC_ROUTE_POLICIES,
  boundedJson,
  remainingTime,
  supabaseCoordinates,
  type PublicRouteEnv,
  type PublicRouteFailure,
} from '../public-boundary/route.ts'
import type { CastChip, ShareCard } from './card.ts'

/** The project variables and static-asset binding available to the Pages Function. */
export interface CardEnv extends PublicRouteEnv {
  SUPABASE_URL?: string
  SUPABASE_ANON_KEY?: string
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_ANON_KEY?: string
  ASSETS: { fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> }
}

export type DescribeShareResult = { status: 'ok'; card: ShareCard } | { status: PublicRouteFailure }

type ShareRowResult =
  { status: 'ok'; row: { kind: string; data: unknown } } | { status: PublicRouteFailure }

type IndexResult =
  { status: 'ok'; indexes: Record<string, unknown> } | { status: PublicRouteFailure }

/** Fetch one row through the database's bounded security-definer function. */
async function readShare(env: CardEnv, code: string, deadline: number): Promise<ShareRowResult> {
  const supabase = supabaseCoordinates(env)
  if (!supabase) return { status: 'unavailable' }
  const result = await boundedJson(
    fetch,
    `${supabase.url}/rest/v1/rpc/share`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: supabase.key,
        authorization: `Bearer ${supabase.key}`,
      },
      body: JSON.stringify({ want: code }),
    },
    {
      timeoutMs: remainingTime(deadline),
      responseBytes: PUBLIC_ROUTE_POLICIES.share.responseBytes,
    },
  )
  if (result.status === 'timed_out') return { status: 'timed_out' }
  if (result.status !== 'ok' || !result.response.ok) return { status: 'unavailable' }
  const value = result.value
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { status: 'missing' }
  }
  const row = value as Record<string, unknown>
  if (row.taken_down === true) return { status: 'missing' }
  if (typeof row.kind !== 'string' || row.data === undefined) return { status: 'missing' }
  return { status: 'ok', row: { kind: row.kind, data: row.data } }
}

/** Fetch only the source indexes declared by the normalized publication. */
async function loadSourceIndexes(
  env: CardEnv,
  origin: string,
  sources: readonly { id: string; indexPath: string }[],
  deadline: number,
): Promise<IndexResult> {
  const indexes: Record<string, unknown> = Object.create(null) as Record<string, unknown>
  const results = await Promise.all(
    sources.map(async (source) => {
      const url = new URL(`/console/compendium/${source.indexPath}`, origin)
      const result = await boundedJson(
        env.ASSETS.fetch.bind(env.ASSETS),
        url,
        {},
        {
          timeoutMs: remainingTime(deadline),
          responseBytes: PUBLIC_ROUTE_POLICIES.share.responseBytes,
        },
      )
      if (result.status === 'timed_out') return 'timed_out' as const
      if (result.status !== 'ok' || !result.response.ok) return 'unavailable' as const
      indexes[source.id] = result.value
      return 'ok' as const
    }),
  )
  if (results.includes('timed_out')) return { status: 'timed_out' }
  if (results.includes('unavailable')) return { status: 'unavailable' }
  return { status: 'ok', indexes }
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

/** Describe one publication and preserve the reason for a bounded fallback. */
export async function describeShareResult(
  env: CardEnv,
  code: string,
  origin: string,
  timeoutMs: number = PUBLIC_ROUTE_POLICIES.share.timeoutMs,
): Promise<DescribeShareResult> {
  if (!isPublicationShareCode(code)) return { status: 'invalid' }
  const deadline = Date.now() + timeoutMs
  const shareResult = await readShare(env, code, deadline)
  if (shareResult.status !== 'ok') return shareResult
  try {
    const normalized = normalizePublication(shareResult.row)
    if (normalized.status !== 'ok') return { status: 'missing' }
    const loaded = await loadSourceIndexes(
      env,
      origin,
      publicationSources(normalized.publication),
      deadline,
    )
    if (loaded.status !== 'ok') return loaded
    const resolved = resolvePublicationPreview(normalized.publication, loaded.indexes)
    return resolved.status === 'ok'
      ? { status: 'ok', card: cardFromPreview(resolved.preview) }
      : { status: 'missing' }
  } catch {
    return { status: 'missing' }
  }
}
