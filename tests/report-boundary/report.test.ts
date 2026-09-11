// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleReportRequest, type ReportEnv } from '../../report-boundary/report.ts'

const env: ReportEnv = {
  SUPABASE_URL: 'https://db.example',
  SUPABASE_ANON_KEY: 'anon-key',
  REPORT_INGRESS_TOKEN: 'ingress-token',
  TURNSTILE_SECRET_KEY: 'turnstile-secret',
  REPORT_FINGERPRINT_KEY: 'fingerprint-secret',
  REPORT_ALLOWED_HOSTS: 'openfray.app,staging.openfray.app',
  PUBLIC_ROUTE_LIMITER: { allow: async () => true },
}

/** Build one valid report request from the public console. */
function request(body: Record<string, unknown> = {}): Request {
  return new Request('https://openfray.app/api/reports', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'cf-connecting-ip': '203.0.113.9',
    },
    body: JSON.stringify({
      code: 'k7mqx3rt9p',
      reason: 'spam',
      message: '',
      replyTo: '',
      challenge: 'turnstile-token',
      ...body,
    }),
  })
}

/** Return the three successful upstream responses in boundary order. */
function acceptedFetch() {
  return vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, hostname: 'openfray.app', action: 'report' })),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ kind: 'encounter', data: {} }), { status: 200 }),
    )
    .mockResolvedValueOnce(new Response(JSON.stringify('accepted'), { status: 200 }))
}

afterEach(() => vi.restoreAllMocks())

describe('anonymous report boundary', () => {
  it('verifies the challenge and current share before the restricted insertion', async () => {
    const fetcher = acceptedFetch()
    const response = await handleReportRequest(request(), env, fetcher)

    expect(response.status).toBe(201)
    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    )
    expect(fetcher.mock.calls[1]?.[0]).toBe('https://db.example/rest/v1/rpc/share')
    const shareRead = fetcher.mock.calls[1]?.[1]
    expect(new Headers(shareRead?.headers).get('apikey')).toBe('anon-key')
    expect(new Headers(shareRead?.headers).get('authorization')).toBeNull()
    expect(fetcher.mock.calls[2]?.[0]).toBe('https://db.example/rest/v1/rpc/accept_share_report')
    const insertion = fetcher.mock.calls[2]?.[1]
    expect(new Headers(insertion?.headers).get('authorization')).toBe('Bearer ingress-token')
    expect(JSON.stringify(insertion?.body)).not.toContain('203.0.113.9')
  })

  it.each([
    ['invalid challenge', { success: false }, 403],
    ['wrong hostname', { success: true, hostname: 'elsewhere.example', action: 'report' }, 403],
    ['wrong action', { success: true, hostname: 'openfray.app', action: 'other' }, 403],
  ])('rejects an %s before reading or writing the share', async (_label, verdict, status) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(verdict)))
    const response = await handleReportRequest(request(), env, fetcher)
    expect(response.status).toBe(status)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('rejects an unpublished share before insertion', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, hostname: 'openfray.app', action: 'report' })),
      )
      .mockResolvedValueOnce(new Response('null'))
    const response = await handleReportRequest(request(), env, fetcher)
    expect(response.status).toBe(404)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['unknown reason', { reason: 'malware' }],
    ['long code', { code: 'k7mqx3rt9p-extra' }],
    ['long message', { message: 'x'.repeat(1001) }],
    ['long reply address', { replyTo: `${'x'.repeat(250)}@example.com` }],
    ['long challenge', { challenge: 'x'.repeat(2049) }],
  ])('rejects a hostile payload with %s without upstream work', async (_label, body) => {
    const fetcher = vi.fn<typeof fetch>()
    const response = await handleReportRequest(request(body), env, fetcher)
    expect(response.status).toBe(400)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('accepts every field at its individual limit within the aggregate request ceiling', async () => {
    const fetcher = acceptedFetch()
    const response = await handleReportRequest(
      request({
        code: 'abcdefghjkmnpqrstuvwxyz23456789a',
        reason: 'impersonation',
        message: 'x'.repeat(1000),
        replyTo: `${'x'.repeat(242)}@example.com`,
        challenge: 'x'.repeat(2048),
      }),
      env,
      fetcher,
    )
    expect(response.status).toBe(201)
  })

  it('rejects a non-JSON request without upstream work', async () => {
    const fetcher = vi.fn<typeof fetch>()
    const response = await handleReportRequest(
      new Request('https://openfray.app/api/reports', { method: 'POST', body: 'report' }),
      env,
      fetcher,
    )
    expect(response.status).toBe(415)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('rejects a request body beyond the byte ceiling before parsing it', async () => {
    const response = await handleReportRequest(
      new Request('https://openfray.app/api/reports', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': '5000' },
        body: JSON.stringify({ message: 'x'.repeat(4500) }),
      }),
      env,
      vi.fn<typeof fetch>(),
    )
    expect(response.status).toBe(413)
  })

  it.each([
    ['duplicate', 409],
    ['share_limited', 429],
    ['network_limited', 429],
    ['missing', 404],
    ['invalid', 400],
  ])('maps the database %s outcome without retrying insertion', async (outcome, status) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, hostname: 'openfray.app', action: 'report' })),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ kind: 'encounter', data: {} }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(outcome), { status: 200 }))
    const response = await handleReportRequest(request(), env, fetcher)
    expect(response.status).toBe(status)
    expect(fetcher).toHaveBeenCalledTimes(3)
  })

  it('returns timed out when an upstream exceeds the route deadline', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation((_input, init) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
      })
    })

    const response = await handleReportRequest(request(), env, fetcher, 1)

    expect(response.status).toBe(504)
    expect(response.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/)
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('fails unavailable without calling an upstream when secrets are missing', async () => {
    const fetcher = vi.fn<typeof fetch>()
    const response = await handleReportRequest(
      request(),
      { ...env, REPORT_INGRESS_TOKEN: '' },
      fetcher,
    )
    expect(response.status).toBe(503)
    expect(fetcher).not.toHaveBeenCalled()
  })
})
