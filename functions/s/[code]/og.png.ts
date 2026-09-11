// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

import { ImageResponse } from 'workers-og'
import { isPublicationShareCode } from '../../../console/src/publication/index.ts'
import {
  boundedResponse,
  canonicalRouteRequest,
  failureResponse,
  identifyResponse,
  publicRequestId,
  routeRateLimiter,
  PUBLIC_ROUTE_POLICIES,
  remainingTime,
  workersCache,
  type PublicRouteFailure,
} from '../../../public-boundary/route.ts'
import { describeShareResult, type CardEnv } from '../../../share-card/describe.ts'
import { cardTree, CARD_HEIGHT, CARD_WIDTH } from '../../../share-card/image.ts'

/**
 * The picture behind a share's `og:image`, drawn per request under one route deadline.
 */

/** Include a real italic face because satori does not synthesize one. */
const FACES = [
  { file: 'inter-500', weight: 500, style: 'normal' },
  { file: 'inter-600', weight: 600, style: 'normal' },
  { file: 'inter-800', weight: 800, style: 'normal' },
  { file: 'inter-italic-500', weight: 500, style: 'italic' },
] as const

/** Short on purpose, matching the HTML: an unpublished share stops unfurling in minutes. */
const CACHE = 'public, s-maxage=300'
const FONT_BYTES = 524_288

let faces: Promise<
  { name: string; data: ArrayBuffer; weight: number; style: 'normal' | 'italic' }[]
> | null = null

/** Load every local font under bounded response and route-wide time ceilings. */
function loadFaces(env: CardEnv, origin: string, deadline: number) {
  faces ??= Promise.all(
    FACES.map(async (face) => {
      const result = await boundedResponse(
        env.ASSETS.fetch.bind(env.ASSETS),
        new URL(`/fonts/${face.file}.ttf`, origin),
        {},
        { timeoutMs: remainingTime(deadline), responseBytes: FONT_BYTES },
      )
      if (result.status !== 'ok') throw new Error(result.status)
      return {
        name: 'Inter',
        data: result.body.buffer as ArrayBuffer,
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

/** Fetch the generic image under a short independent fallback bound. */
async function genericImage(env: CardEnv, request: Request): Promise<Response> {
  const result = await boundedResponse(
    env.ASSETS.fetch.bind(env.ASSETS),
    new URL('/og-image.png', request.url),
    {},
    { timeoutMs: 500, responseBytes: PUBLIC_ROUTE_POLICIES.image.responseBytes },
  )
  return result.status === 'ok'
    ? new Response(result.body, { headers: result.response.headers })
    : new Response(null, { headers: { 'content-type': 'image/png' } })
}

/** Classify an image rendering error without retaining its message. */
function renderFailure(error: unknown, deadline: number): PublicRouteFailure {
  if (Date.now() >= deadline || (error instanceof Error && error.message === 'timed_out')) {
    return 'timed_out'
  }
  return 'unavailable'
}

/** Draw or retrieve one bounded share image. */
export const onRequestGet: PagesFunction<CardEnv> = async ({ params, env, request }) => {
  const requestId = publicRequestId()
  const code = String(params.code ?? '').toLowerCase()
  /** Return this request's generic local image. */
  const fallback = () => genericImage(env, request)
  if (request.url.length > 2_048 || !isPublicationShareCode(code)) {
    return failureResponse(await fallback(), 'image', 'invalid', requestId)
  }
  const limiter = routeRateLimiter(env)
  const admission = await limiter.allow(request, PUBLIC_ROUTE_POLICIES.image)
  if (admission !== true) {
    return failureResponse(
      await fallback(),
      'image',
      admission === 'unavailable' ? 'unavailable' : 'limited',
      requestId,
    )
  }

  const cache = workersCache()
  const cacheKey = canonicalRouteRequest(request, `/s/${code}/og.png`)
  const hit = await cache?.match(cacheKey)
  if (hit) return identifyResponse(hit, requestId)

  const deadline = Date.now() + PUBLIC_ROUTE_POLICIES.image.timeoutMs
  const described = await describeShareResult(env, code, request.url, remainingTime(deadline))
  if (described.status !== 'ok') {
    return failureResponse(await fallback(), 'image', described.status, requestId)
  }

  try {
    const image = new ImageResponse(cardTree(described.card) as never, {
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      format: 'png',
      fonts: await loadFaces(env, request.url, deadline),
    })
    const rendered = await boundedResponse(
      async () => image,
      request.url,
      {},
      {
        timeoutMs: remainingTime(deadline),
        responseBytes: PUBLIC_ROUTE_POLICIES.image.responseBytes,
      },
    )
    if (rendered.status !== 'ok') {
      return failureResponse(
        await fallback(),
        'image',
        renderFailure(new Error(rendered.status), deadline),
        requestId,
      )
    }
    const headers = new Headers(image.headers)
    headers.set('cache-control', CACHE)
    const drawn = new Response(rendered.body, { headers })
    await cache?.put(cacheKey, drawn.clone())
    return identifyResponse(drawn, requestId)
  } catch (error) {
    return failureResponse(await fallback(), 'image', renderFailure(error, deadline), requestId)
  }
}
