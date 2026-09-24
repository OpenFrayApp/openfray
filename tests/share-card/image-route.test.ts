// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('workers-og', () => ({
  ImageResponse: class extends Response {},
}))

import { onRequestGet } from '../../functions/s/[code]/og.png.ts'
import type { CardEnv } from '../../share-card/describe.ts'

const CODE = 'k7mqx3rt9p'

/** Build an image-route environment with a controlled route limiter. */
function env(allow: boolean): CardEnv {
  return {
    SUPABASE_URL: 'https://db.example',
    SUPABASE_ANON_KEY: 'anon',
    PUBLIC_ROUTE_LIMITER: { allow: async () => allow },
    ASSETS: {
      async fetch() {
        return new Response('generic-image', { headers: { 'content-type': 'image/png' } })
      },
    },
  }
}

/** Invoke the image route with a synthetic capability path. */
async function route(environment: CardEnv, code = CODE, query = ''): Promise<Response> {
  return onRequestGet({
    params: { code },
    env: environment,
    request: new Request(`https://openfray.app/s/${code}/og.png${query}`, {
      headers: { 'cf-connecting-ip': '203.0.113.9' },
    }),
  } as never)
}

afterEach(() => vi.unstubAllGlobals())

describe('share image route controls', () => {
  it('rejects a malformed capability before rate-limit or upstream work', async () => {
    const limiter = vi.fn(async () => false)
    const environment = env(true)
    environment.PUBLIC_ROUTE_LIMITER = { allow: limiter }
    const fetcher = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetcher)

    const response = await route(environment, 'not-a-code')

    expect(response.status).toBe(400)
    expect(limiter).not.toHaveBeenCalled()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('returns the bounded generic image before upstream work when limited', async () => {
    const fetcher = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetcher)

    const response = await route(env(false))

    expect(response.status).toBe(429)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/)
    expect(await response.text()).toBe('generic-image')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('uses one normalized cache key across case and query variants', async () => {
    const keys: string[] = []
    const cached = new Response('cached-image', { headers: { 'content-type': 'image/png' } })
    vi.stubGlobal('caches', {
      default: {
        /** Record and answer one normalized cache lookup. */
        async match(input: Request) {
          keys.push(input.url)
          return cached.clone()
        },
      },
    })

    expect(await (await route(env(true), CODE.toUpperCase(), '?utm_source=one')).text()).toBe(
      'cached-image',
    )
    expect(await (await route(env(true), CODE, '?utm_source=two')).text()).toBe('cached-image')
    expect(keys).toEqual([
      `https://openfray.app/s/${CODE}/og.png`,
      `https://openfray.app/s/${CODE}/og.png`,
    ])
  })
})
