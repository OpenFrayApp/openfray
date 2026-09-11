// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

import { describe, expect, it, vi } from 'vitest'
import {
  FixedWindowRateLimiter,
  PUBLIC_ROUTE_POLICIES,
  boundedJson,
  canonicalRouteRequest,
  publicRequestId,
  readBoundedBody,
  routeRateLimiter,
} from '../../public-boundary/route.ts'

/** Build one edge request with the network header supplied by Cloudflare. */
function request(url = 'https://openfray.app/s/K7MQX3RT9P?utm_source=chat'): Request {
  return new Request(url, { headers: { 'cf-connecting-ip': '203.0.113.9' } })
}

describe('public route controls', () => {
  it('normalizes case and irrelevant query values into one cache key', () => {
    const first = canonicalRouteRequest(request(), '/s/k7mqx3rt9p/og.png')
    const second = canonicalRouteRequest(
      request('https://OPENFRAY.app/s/k7mqx3rt9p?utm_source=other#fragment'),
      '/s/k7mqx3rt9p/og.png',
    )

    expect(first.url).toBe('https://openfray.app/s/k7mqx3rt9p/og.png')
    expect(second.url).toBe(first.url)
  })

  it('applies separate coarse thresholds without retaining the network address', async () => {
    const limiter = new FixedWindowRateLimiter(10, () => 1_000)
    const share = { ...PUBLIC_ROUTE_POLICIES.share, requests: 2 }
    const image = { ...PUBLIC_ROUTE_POLICIES.image, requests: 1 }

    expect(await limiter.allow(request(), share)).toBe(true)
    expect(await limiter.allow(request(), share)).toBe(true)
    expect(await limiter.allow(request(), share)).toBe(false)
    expect(await limiter.allow(request(), image)).toBe(true)
    expect(limiter.identifiers()).not.toContain('203.0.113.9')
  })

  it('uses the shared deployment limiter with a stable opaque network key', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }))
    const limiter = routeRateLimiter({
      PUBLIC_ROUTE_RATE_LIMITER: { fetch: fetcher },
      PUBLIC_ROUTE_FINGERPRINT_KEY: 'environment-secret',
    })

    expect(await limiter.allow(request(), PUBLIC_ROUTE_POLICIES.share)).toBe(true)
    expect(await limiter.allow(request(), PUBLIC_ROUTE_POLICIES.share)).toBe(true)
    const calls = fetcher.mock.calls
    const first = new Headers(calls[0]?.[1]?.headers).get('x-openfray-rate-key')
    const second = new Headers(calls[1]?.[1]?.headers).get('x-openfray-rate-key')
    expect(first).toMatch(/^[0-9a-f]{64}$/)
    expect(second).toBe(first)
    expect(JSON.stringify(calls)).not.toContain('203.0.113.9')
  })

  it('fails closed when the shared deployment limiter is missing', async () => {
    expect(await routeRateLimiter({}).allow(request(), PUBLIC_ROUTE_POLICIES.share)).toBe(
      'unavailable',
    )
  })

  it('fails closed when the bounded limiter has no room for another network', async () => {
    const limiter = new FixedWindowRateLimiter(1, () => 1_000)
    const policy = { ...PUBLIC_ROUTE_POLICIES.share, requests: 2 }

    expect(await limiter.allow(request(), policy)).toBe(true)
    expect(
      await limiter.allow(
        new Request('https://openfray.app/s/abcdefghjk', {
          headers: { 'cf-connecting-ip': '198.51.100.4' },
        }),
        policy,
      ),
    ).toBe(false)
  })

  it('cancels a chunked request body at the route payload ceiling', async () => {
    const cancel = vi.fn()
    let chunks = 0
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(3))
        chunks += 1
        if (chunks === 3) controller.close()
      },
      cancel,
    })
    const input = new Request('https://openfray.app/api/reports', {
      method: 'POST',
      body,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' })

    expect(await readBoundedBody(input, 5, AbortSignal.timeout(100))).toBe('large')
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('distinguishes oversized, unavailable, and timed-out upstream JSON', async () => {
    const oversized = await boundedJson(
      vi.fn<typeof fetch>().mockResolvedValue(new Response('123456')),
      'https://upstream.example',
      {},
      { timeoutMs: 100, responseBytes: 5 },
    )
    const unavailable = await boundedJson(
      vi.fn<typeof fetch>().mockRejectedValue(new Error('offline')),
      'https://upstream.example',
      {},
      { timeoutMs: 100, responseBytes: 5 },
    )
    const timedOut = await boundedJson(
      vi.fn<typeof fetch>().mockImplementation((_input, init) => {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
        })
      }),
      'https://upstream.example',
      {},
      { timeoutMs: 1, responseBytes: 5 },
    )

    expect(oversized.status).toBe('large')
    expect(unavailable.status).toBe('unavailable')
    expect(timedOut.status).toBe('timed_out')
  })

  it('creates opaque request identifiers without request data', () => {
    const id = publicRequestId()
    expect(id).toMatch(/^[0-9a-f-]{36}$/)
    expect(id).not.toContain('k7mqx3rt9p')
  })
})
