// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>
}

interface Env {
  SHARE_RATE_LIMIT: RateLimitBinding
  IMAGE_RATE_LIMIT: RateLimitBinding
  REPORT_RATE_LIMIT: RateLimitBinding
  CSP_REPORT_RATE_LIMIT: RateLimitBinding
}

const KEY = /^[0-9a-f]{64}$/

/** Resolve one public route to its independent native rate-limit binding. */
function binding(env: Env, route: string): RateLimitBinding | null {
  if (route === 'share') return env.SHARE_RATE_LIMIT
  if (route === 'image') return env.IMAGE_RATE_LIMIT
  if (route === 'report') return env.REPORT_RATE_LIMIT
  if (route === 'csp-report') return env.CSP_REPORT_RATE_LIMIT
  return null
}

export default {
  /** Admit one opaque network key through the selected shared route counter. */
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'POST') return new Response(null, { status: 405 })
    const limiter = binding(env, new URL(request.url).pathname.slice(1))
    if (!limiter) return new Response(null, { status: 404 })
    const key = request.headers.get('x-openfray-rate-key') ?? ''
    if (!KEY.test(key)) return new Response(null, { status: 400 })
    const result = await limiter.limit({ key })
    return new Response(null, { status: result.success ? 204 : 429 })
  },
}
