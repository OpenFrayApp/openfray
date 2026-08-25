// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

import { ImageResponse } from 'workers-og'
import { describeShare, type CardEnv } from '../../../share-card/describe.ts'
import { cardTree, CARD_HEIGHT, CARD_WIDTH } from '../../../share-card/image.ts'

/**
 * The picture behind a share's `og:image`, drawn per request.
 *
 * 1200×630 exactly, because the shell declares those numbers and a crawler lays the embed
 * out from them before the picture arrives. A mismatch shows as a stretched card.
 *
 * Discord, Slack and X each fetch the image separately, so one paste rasterizes three times
 * unless something remembers. `caches.default` keyed by the URL is that something, and the
 * short shared max-age is the same one the HTML carries: a taken-down share has to stop
 * unfurling within minutes.
 */

/**
 * The faces the card draws in. The italic is its own file rather than a slant satori would
 * synthesise, because satori does not synthesise one: a creature's type line is italic on a
 * stat block, and without the face it silently comes out upright.
 */
const FACES = [
  { file: 'inter-500', weight: 500, style: 'normal' },
  { file: 'inter-600', weight: 600, style: 'normal' },
  { file: 'inter-800', weight: 800, style: 'normal' },
  { file: 'inter-italic-500', weight: 500, style: 'italic' },
] as const

/** Short on purpose, matching the HTML: an unpublished share stops unfurling in minutes. */
const CACHE = 'public, s-maxage=300'

let faces: Promise<
  { name: string; data: ArrayBuffer; weight: number; style: 'normal' | 'italic' }[]
> | null = null

/**
 * Inter, from the deploy's own assets rather than the Worker bundle or a font service.
 *
 * Satori needs real font files and cannot read the system stack the brand banner names.
 * Fetched once per isolate: a card is three weights of the same face every time.
 */
function loadFaces(env: CardEnv, origin: string) {
  faces ??= Promise.all(
    FACES.map(async (face) => {
      const response = await env.ASSETS.fetch(new URL(`/fonts/${face.file}.ttf`, origin))
      return {
        name: 'Inter',
        data: await response.arrayBuffer(),
        weight: face.weight as number,
        style: face.style as 'normal' | 'italic',
      }
    }),
  ).catch((error) => {
    faces = null
    throw error
  })
  return faces
}

/**
 * The Workers runtime's shared cache. It is reached through a cast because this project
 * type-checks against the DOM's `CacheStorage` too, and that one has no `default`.
 */
const edgeCache = (): Cache => (caches as unknown as { default: Cache }).default

export const onRequestGet: PagesFunction<CardEnv> = async ({ params, env, request }) => {
  const cache = edgeCache()
  const hit = await cache.match(request)
  if (hit) return hit

  const code = String(params.code ?? '').toLowerCase()
  const card = await describeShare(env, code, request.url)
  // Nothing published under this code, so nothing pointed here: the shell fell through and
  // named the site banner. Answering with it anyway keeps a stale card from breaking.
  if (!card) return env.ASSETS.fetch(new URL('/og-image.png', request.url))

  try {
    // Satori's own input shape. `ImageResponse` types it as a React node; passing a string
    // instead sends it through the HTML parser that drops nested styles.
    const image = new ImageResponse(cardTree(card) as never, {
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      format: 'png',
      fonts: await loadFaces(env, request.url),
    })
    const headers = new Headers(image.headers)
    headers.set('cache-control', CACHE)
    const drawn = new Response(image.body, { headers })
    await cache.put(request, drawn.clone())
    return drawn
  } catch {
    // A card that cannot be drawn is still a link that has to unfurl.
    return env.ASSETS.fetch(new URL('/og-image.png', request.url))
  }
}
