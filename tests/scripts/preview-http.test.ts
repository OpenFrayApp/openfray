// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchPreview, fetchPreviewScripts } from './preview-http'

const origin = 'http://127.0.0.1:8799'
afterEach(() => vi.unstubAllGlobals())

describe('preview HTTP isolation', () => {
  it('downloads local scripts without requesting referenced external analytics', async () => {
    const requests: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: URL) => {
        requests.push(url.href)
        return new Response('export const local = true', {
          headers: { 'Content-Type': 'text/javascript' },
        })
      }),
    )
    const assets = await fetchPreviewScripts(
      `
      <script defer src="https://cdn.usefathom.com/script.js"></script>
      <script src="//external.invalid/analytics.js"></script>
      <script type="module" src="/_astro/auth.js"></script>
      <script src="/local.js"></script>
    `,
      origin,
    )
    expect(requests).toEqual([`${origin}/_astro/auth.js`, `${origin}/local.js`])
    expect(assets.map((asset) => asset.url.href)).toEqual([
      `${origin}/_astro/auth.js`,
      `${origin}/local.js`,
    ])
  })

  it.each([
    'https://cdn.usefathom.com/script.js',
    '//external.invalid/auth.js',
    'http://127.0.0.1:8800/auth.js',
  ])(
    'refuses redirects escaping the preview origin without an outbound request: %s',
    async (destination) => {
      const requests: { url: string; redirect?: RequestRedirect }[] = []
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: URL, options?: RequestInit) => {
          requests.push({ url: url.href, redirect: options?.redirect })
          if (options?.redirect !== 'manual') {
            requests.push({ url: new URL(destination, origin).href })
            return new Response('external script')
          }
          return new Response(null, { status: 302, headers: { Location: destination } })
        }),
      )
      await expect(
        fetchPreviewScripts('<script type="module" src="/_astro/redirect.js"></script>', origin),
      ).rejects.toThrow('same-origin')
      expect(requests).toEqual([{ url: `${origin}/_astro/redirect.js`, redirect: 'manual' }])
    },
  )

  it('refuses a direct external URL before calling the transport', async () => {
    const transport = vi.fn(async () => new Response(''))
    vi.stubGlobal('fetch', transport)
    await expect(fetchPreview('https://external.invalid/script.js', origin)).rejects.toThrow(
      'same-origin',
    )
    expect(transport).not.toHaveBeenCalled()
  })

  it('follows relative redirects within the preview origin with automatic redirects disabled', async () => {
    const requests: { url: string; redirect?: RequestRedirect }[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: URL, options?: RequestInit) => {
        requests.push({ url: url.href, redirect: options?.redirect })
        return url.pathname === '/sign-in'
          ? new Response(null, {
              status: 301,
              headers: { Location: '/sign-in/?returnTo=%2Fconsole%2F' },
            })
          : new Response('local page')
      }),
    )
    expect(await (await fetchPreview(`${origin}/sign-in`, origin)).text()).toBe('local page')
    expect(requests).toEqual([
      { url: `${origin}/sign-in`, redirect: 'manual' },
      { url: `${origin}/sign-in/?returnTo=%2Fconsole%2F`, redirect: 'manual' },
    ])
  })

  it('fails redirect loops without any request escaping the preview origin', async () => {
    const transport = vi.fn(
      async () => new Response(null, { status: 302, headers: { Location: '/loop' } }),
    )
    vi.stubGlobal('fetch', transport)
    await expect(fetchPreview('/loop', origin)).rejects.toThrow('redirect limit')
    expect(transport).toHaveBeenCalledTimes(11)
  })

  it('rejects a redirect without a destination', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 302 })),
    )
    await expect(fetchPreview('/redirect', origin)).rejects.toThrow('location')
  })

  it.each([
    '<script type="module" src="https://external.invalid/auth.js"></script>',
    '<script src="/_astro/classic.js"></script>',
    '<script type="module">console.log("inline")</script>',
  ])('requires a local module before downloading scripts: %s', async (html) => {
    const transport = vi.fn(async () => new Response(''))
    vi.stubGlobal('fetch', transport)
    await expect(fetchPreviewScripts(html, origin)).rejects.toThrow('local module')
    expect(transport).not.toHaveBeenCalled()
  })
})
