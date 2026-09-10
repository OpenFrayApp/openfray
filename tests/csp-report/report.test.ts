// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

import { describe, expect, it, vi } from 'vitest'
import { handleCspReportRequest } from '../../security/csp-report.ts'

const PRIVATE_VALUES = {
  authored: 'A secret encounter note',
  account: 'person@example.com',
  capability: 'k7mqx3rt9p',
  token: 'access-token-value',
} as const

/** Build one browser CSP report containing values that diagnostics must discard. */
function request(overrides: Record<string, unknown> = {}): Request {
  return new Request('https://openfray.app/api/csp-reports', {
    method: 'POST',
    headers: { 'content-type': 'application/csp-report' },
    body: JSON.stringify({
      'csp-report': {
        'effective-directive': 'script-src-elem',
        disposition: 'enforce',
        'status-code': 200,
        'blocked-uri': `https://evil.example/${PRIVATE_VALUES.capability}?token=${PRIVATE_VALUES.token}`,
        'document-uri': `https://openfray.app/s/${PRIVATE_VALUES.capability}`,
        'source-file': `https://openfray.app/console/?account=${PRIVATE_VALUES.account}`,
        sample: PRIVATE_VALUES.authored,
        ...overrides,
      },
    }),
  })
}

describe('CSP report boundary', () => {
  it('logs only a bounded resource class and fixed violation fields', async () => {
    const log = vi.fn()
    const response = await handleCspReportRequest(request(), log)

    expect(response.status).toBe(204)
    expect(log).toHaveBeenCalledWith({
      kind: 'csp-violation',
      directive: 'script-src-elem',
      disposition: 'enforce',
      statusCode: 200,
      resourceClass: 'https',
    })
    const diagnostic = JSON.stringify(log.mock.calls)
    for (const value of Object.values(PRIVATE_VALUES)) expect(diagnostic).not.toContain(value)
    expect(diagnostic).not.toContain('evil.example')
    expect(diagnostic).not.toContain('openfray.app')
  })

  it.each([
    ['inline', 'inline'],
    ['eval', 'eval'],
    ['data:text/javascript,private', 'data'],
    ['blob:https://openfray.app/private', 'blob'],
    ['wss://private.example/socket', 'wss'],
    ['/console/private.js', 'self'],
  ])('reduces %s to the %s resource class', async (blockedUri, resourceClass) => {
    const log = vi.fn()
    const response = await handleCspReportRequest(request({ 'blocked-uri': blockedUri }), log)

    expect(response.status).toBe(204)
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ resourceClass }))
  })

  it('rejects malformed and oversized reports without logging their values', async () => {
    const log = vi.fn()
    const privateDirective = request({ 'effective-directive': PRIVATE_VALUES.capability })
    const malformed = new Request('https://openfray.app/api/csp-reports', {
      method: 'POST',
      headers: { 'content-type': 'application/csp-report' },
      body: PRIVATE_VALUES.authored,
    })
    const oversized = new Request('https://openfray.app/api/csp-reports', {
      method: 'POST',
      headers: {
        'content-type': 'application/csp-report',
        'content-length': '5000',
      },
      body: JSON.stringify({ value: PRIVATE_VALUES.authored.repeat(300) }),
    })

    expect((await handleCspReportRequest(privateDirective, log)).status).toBe(400)
    expect((await handleCspReportRequest(malformed, log)).status).toBe(400)
    expect((await handleCspReportRequest(oversized, log)).status).toBe(413)
    expect(log).not.toHaveBeenCalled()
  })

  it('cancels a chunked body as soon as it crosses the byte ceiling', async () => {
    const log = vi.fn()
    const cancel = vi.fn()
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(2048))
        controller.enqueue(new Uint8Array(2048))
        controller.enqueue(new Uint8Array(1))
        controller.enqueue(new Uint8Array(2048))
        controller.close()
      },
      cancel,
    })
    const chunked = new Request('https://openfray.app/api/csp-reports', {
      method: 'POST',
      headers: { 'content-type': 'application/csp-report' },
      body,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' })

    expect((await handleCspReportRequest(chunked, log)).status).toBe(413)
    expect(cancel).toHaveBeenCalledOnce()
    expect(log).not.toHaveBeenCalled()
  })

  it('rejects unsupported methods and content types', async () => {
    const log = vi.fn()
    const get = new Request('https://openfray.app/api/csp-reports')
    const json = new Request('https://openfray.app/api/csp-reports', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })

    expect((await handleCspReportRequest(get, log)).status).toBe(405)
    expect((await handleCspReportRequest(json, log)).status).toBe(415)
    expect(log).not.toHaveBeenCalled()
  })
})
