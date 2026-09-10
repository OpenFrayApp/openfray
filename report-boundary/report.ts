// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

import {
  isPublicationShareCode,
  isReportReason,
  REPORT_LIMITS,
} from '../console/src/publication/index.ts'
import {
  boundedJson,
  failureResponse,
  identifyResponse,
  publicRequestId,
  routeRateLimiter,
  PUBLIC_ROUTE_POLICIES,
  readBoundedBody,
  remainingTime,
  supabaseCoordinates,
  type PublicRouteEnv,
} from '../public-boundary/route.ts'

const TURNSTILE_VERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

/** Secrets and public project coordinates available to the report Function. */
export interface ReportEnv extends PublicRouteEnv {
  SUPABASE_URL?: string
  SUPABASE_ANON_KEY?: string
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_ANON_KEY?: string
  REPORT_INGRESS_TOKEN?: string
  TURNSTILE_SECRET_KEY?: string
  REPORT_FINGERPRINT_KEY?: string
  REPORT_ALLOWED_HOSTS?: string
}

interface ReportInput {
  code: string
  reason: string
  message: string
  replyTo: string
  challenge: string
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

/** Return a privacy-safe JSON response that must not be cached. */
function answer(status: number, result: string, requestId: string): Response {
  return identifyResponse(
    Response.json(
      { result },
      { status, headers: { 'cache-control': 'no-store', 'content-type': 'application/json' } },
    ),
    requestId,
  )
}

/** Parse one bounded report body without retaining unknown fields. */
async function parseReport(
  request: Request,
  deadline: number,
): Promise<ReportInput | 'large' | 'timed_out' | null> {
  const bytes = await readBoundedBody(
    request,
    REPORT_LIMITS.requestBytes,
    AbortSignal.timeout(remainingTime(deadline)),
  )
  if (bytes === 'large' || bytes === 'timed_out' || bytes === null) return bytes
  let value: unknown
  try {
    value = JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    return null
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  const input = {
    code: row.code,
    reason: row.reason,
    message: row.message,
    replyTo: row.replyTo,
    challenge: row.challenge,
  }
  if (Object.values(input).some((field) => typeof field !== 'string')) return null
  const report = input as ReportInput
  if (!isPublicationShareCode(report.code) || !isReportReason(report.reason)) return null
  if (
    report.message.length > REPORT_LIMITS.messageCharacters ||
    report.replyTo.length > REPORT_LIMITS.replyCharacters ||
    report.challenge.length === 0 ||
    report.challenge.length > REPORT_LIMITS.challengeCharacters
  ) {
    return null
  }
  return report
}

/** Verify a single-use report challenge for an allowed deployed hostname. */
async function verifyChallenge(
  input: ReportInput,
  network: string,
  env: ReportEnv,
  fetcher: Fetcher,
  deadline: number,
): Promise<'ok' | 'invalid' | 'unavailable' | 'timed_out'> {
  const body = new FormData()
  body.set('secret', env.TURNSTILE_SECRET_KEY ?? '')
  body.set('response', input.challenge)
  body.set('remoteip', network)
  body.set('idempotency_key', crypto.randomUUID())
  const result = await boundedJson(
    fetcher,
    TURNSTILE_VERIFY,
    { method: 'POST', body },
    {
      timeoutMs: remainingTime(deadline),
      responseBytes: 8_192,
    },
  )
  if (result.status === 'timed_out') return 'timed_out'
  if (result.status !== 'ok' || !result.response.ok) return 'unavailable'
  if (typeof result.value !== 'object' || result.value === null || Array.isArray(result.value)) {
    return 'unavailable'
  }
  const verdict = result.value as Record<string, unknown>
  const hosts = new Set(
    (env.REPORT_ALLOWED_HOSTS ?? '')
      .split(',')
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean),
  )
  return verdict.success === true &&
    verdict.action === 'report' &&
    typeof verdict.hostname === 'string' &&
    hosts.has(verdict.hostname.toLowerCase())
    ? 'ok'
    : 'invalid'
}

/** Confirm that the capability still names a currently published row. */
async function publishedShare(
  input: ReportInput,
  env: ReportEnv,
  fetcher: Fetcher,
  deadline: number,
): Promise<'ok' | 'missing' | 'unavailable' | 'timed_out'> {
  const db = supabaseCoordinates(env)
  if (!db) return 'unavailable'
  const result = await boundedJson(
    fetcher,
    `${db.url}/rest/v1/rpc/share`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: db.key,
        authorization: `Bearer ${db.key}`,
      },
      body: JSON.stringify({ want: input.code }),
    },
    { timeoutMs: remainingTime(deadline), responseBytes: 65_536 },
  )
  if (result.status === 'timed_out') return 'timed_out'
  if (result.status !== 'ok' || !result.response.ok) return 'unavailable'
  const value = result.value
  return typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !('taken_down' in value)
    ? 'ok'
    : 'missing'
}

/** Return an unlinkable HMAC for quota and duplicate comparisons. */
async function fingerprint(secret: string, value: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signed = await crypto.subtle.sign('HMAC', key, encoder.encode(value))
  return [...new Uint8Array(signed)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** Ask the ingress-only database operation to enforce quotas and insert atomically. */
async function insertReport(
  input: ReportInput,
  network: string,
  env: ReportEnv,
  fetcher: Fetcher,
  deadline: number,
): Promise<string | 'unavailable' | 'timed_out'> {
  const db = supabaseCoordinates(env)
  if (!db || !env.REPORT_FINGERPRINT_KEY || !env.REPORT_INGRESS_TOKEN) return 'unavailable'
  const networkKey = await fingerprint(env.REPORT_FINGERPRINT_KEY, `network:${network}`)
  const duplicateKey = await fingerprint(
    env.REPORT_FINGERPRINT_KEY,
    JSON.stringify([
      networkKey,
      input.code,
      input.reason,
      input.message.trim(),
      input.replyTo.trim(),
    ]),
  )
  const result = await boundedJson(
    fetcher,
    `${db.url}/rest/v1/rpc/accept_share_report`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: db.key,
        authorization: `Bearer ${env.REPORT_INGRESS_TOKEN}`,
      },
      body: JSON.stringify({
        want: input.code,
        why: input.reason,
        note: input.message.trim() || null,
        reply_to: input.replyTo.trim() || null,
        network_key: networkKey,
        duplicate_key: duplicateKey,
      }),
    },
    { timeoutMs: remainingTime(deadline), responseBytes: 1_024 },
  )
  if (result.status === 'timed_out') return 'timed_out'
  return result.status === 'ok' && result.response.ok && typeof result.value === 'string'
    ? result.value
    : 'unavailable'
}

/** Accept one anonymous report through challenge, publication, quota, and insertion gates. */
export async function handleReportRequest(
  request: Request,
  env: ReportEnv,
  fetcher: Fetcher = fetch,
  timeoutMs: number = PUBLIC_ROUTE_POLICIES.report.timeoutMs,
): Promise<Response> {
  const requestId = publicRequestId()
  /** Return one classified report failure with privacy-safe diagnostics. */
  const fail = (failure: 'invalid' | 'limited' | 'missing' | 'unavailable' | 'timed_out') =>
    failureResponse(
      answer(200, failure === 'unavailable' ? 'unavailable' : 'failed', requestId),
      'report',
      failure,
      requestId,
    )
  if (request.method !== 'POST') return answer(405, 'failed', requestId)
  if (request.headers.get('content-type')?.split(';', 1)[0].trim() !== 'application/json') {
    return answer(415, 'failed', requestId)
  }
  const limiter = routeRateLimiter(env)
  const admission = await limiter.allow(request, PUBLIC_ROUTE_POLICIES.report)
  if (admission !== true) return fail(admission === 'unavailable' ? 'unavailable' : 'limited')
  if (
    !supabaseCoordinates(env) ||
    !env.REPORT_INGRESS_TOKEN ||
    !env.TURNSTILE_SECRET_KEY ||
    !env.REPORT_FINGERPRINT_KEY ||
    !env.REPORT_ALLOWED_HOSTS
  ) {
    return fail('unavailable')
  }
  const deadline = Date.now() + timeoutMs
  const parsed = await parseReport(request, deadline)
  if (parsed === 'large') return answer(413, 'failed', requestId)
  if (parsed === 'timed_out') return fail('timed_out')
  if (!parsed) return fail('invalid')
  const network = request.headers.get('cf-connecting-ip')?.trim()
  if (!network || network.length > 64) return fail('invalid')
  const challenge = await verifyChallenge(parsed, network, env, fetcher, deadline)
  if (challenge === 'timed_out' || challenge === 'unavailable') return fail(challenge)
  if (challenge === 'invalid') return answer(403, 'failed', requestId)
  const published = await publishedShare(parsed, env, fetcher, deadline)
  if (published !== 'ok') return fail(published)
  const outcome = await insertReport(parsed, network, env, fetcher, deadline)
  if (outcome === 'accepted') return answer(201, 'ok', requestId)
  if (outcome === 'duplicate') return answer(409, 'failed', requestId)
  if (outcome === 'share_limited' || outcome === 'network_limited') return fail('limited')
  if (outcome === 'missing') return fail('missing')
  if (outcome === 'invalid') return fail('invalid')
  if (outcome === 'timed_out') return fail('timed_out')
  return fail('unavailable')
}
