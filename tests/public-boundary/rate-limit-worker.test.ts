// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

import { describe, expect, it, vi } from 'vitest'
import worker from '../../rate-limit-worker/index.ts'

/** Build all native bindings around one controlled admission result. */
function env(success: boolean) {
  const limit = vi.fn(async () => ({ success }))
  const binding = { limit }
  return {
    environment: {
      SHARE_RATE_LIMIT: binding,
      IMAGE_RATE_LIMIT: binding,
      REPORT_RATE_LIMIT: binding,
      CSP_REPORT_RATE_LIMIT: binding,
    },
    limit,
  }
}

/** Build one private service-binding request with an opaque network key. */
function request(route: string, key = 'a'.repeat(64)): Request {
  return new Request(`https://rate-limit.internal/${route}`, {
    method: 'POST',
    headers: { 'x-openfray-rate-key': key },
  })
}

describe('shared public route limiter Worker', () => {
  it.each(['share', 'image', 'report', 'csp-report'])(
    'selects the %s route binding',
    async (route) => {
      const { environment, limit } = env(true)

      expect((await worker.fetch(request(route), environment)).status).toBe(204)
      expect(limit).toHaveBeenCalledWith({ key: 'a'.repeat(64) })
    },
  )

  it('returns limited when the native binding rejects the key', async () => {
    expect((await worker.fetch(request('share'), env(false).environment)).status).toBe(429)
  })

  it('rejects unknown routes and malformed keys before native work', async () => {
    const { environment, limit } = env(true)

    expect((await worker.fetch(request('other'), environment)).status).toBe(404)
    expect((await worker.fetch(request('share', 'private-address'), environment)).status).toBe(400)
    expect(limit).not.toHaveBeenCalled()
  })
})
