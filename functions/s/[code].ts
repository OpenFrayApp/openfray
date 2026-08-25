// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

import { describeShare, type CardEnv } from '../../share-card/describe.ts'
import { cardDescription, cardImageAlt, type ShareCard } from '../../share-card/card.ts'

/**
 * The card a `/s/<code>` link unfurls with.
 *
 * The code in the URL names one encounter or one stat block, and until this existed the
 * preview said the same sentence for every one of them. That was not an oversight: one file
 * served every code, so per-share tags had nowhere to come from.
 *
 * This decorates the response the asset server already produces rather than building one.
 * `next()` is what applies `_redirects` and `_headers`, so the shell, the caching and the
 * `noindex` all stay in one place, and `HTMLRewriter` swaps the contents of tags that are
 * already there. Templating a fresh document here is how the shell and the Function come to
 * drift.
 *
 * Every failure degrades to exactly the old behaviour — the generic card, HTTP 200 — never
 * to a 404 or a 500. See `describeShare`.
 */

/** Short on purpose: an unpublished or taken-down share stops unfurling within minutes. */
const CACHE = 'public, s-maxage=300'

/** Swap the contents of one meta tag, matched on the attribute that names it. */
class MetaContent {
  constructor(private readonly values: Record<string, string>) {}

  element(el: Element): void {
    const key = el.getAttribute('property') ?? el.getAttribute('name')
    const value = key ? this.values[key] : undefined
    if (value !== undefined) el.setAttribute('content', value)
  }
}

/** Swap the document title. */
class Title {
  constructor(private readonly title: string) {}

  element(el: Element): void {
    el.setInnerContent(this.title)
  }
}

/** The shell again, describing this share rather than the surface it sits on. */
function decorate(response: Response, card: ShareCard, code: string, origin: string): Response {
  const url = new URL(`/s/${code}`, origin).toString()
  const image = new URL(`/s/${code}/og.png`, origin).toString()
  const description = cardDescription(card)
  const values: Record<string, string> = {
    description,
    'og:title': card.name,
    'og:description': description,
    'og:url': url,
    'og:image': image,
    'og:image:alt': cardImageAlt(card),
    'twitter:title': card.name,
    'twitter:description': description,
    'twitter:image': image,
  }
  const decorated = new HTMLRewriter()
    .on('title', new Title(card.name))
    .on('meta', new MetaContent(values))
    .transform(response)
  const headers = new Headers(decorated.headers)
  headers.set('cache-control', CACHE)
  return new Response(decorated.body, {
    status: decorated.status,
    statusText: decorated.statusText,
    headers,
  })
}

export const onRequestGet: PagesFunction<CardEnv> = async ({ params, env, request, next }) => {
  const code = String(params.code ?? '').toLowerCase()
  const card = await describeShare(env, code, request.url)
  if (!card) return next()
  return decorate(await next(), card, code, request.url)
}
