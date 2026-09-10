// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

import {
  isPublicationShareCode,
  isReportReason,
  REPORT_LIMITS,
} from '../console/src/publication/index.ts'

const TURNSTILE_VERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

/** Secrets and public project coordinates available to the report Function. */
export interface ReportEnv {
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
function answer(status: number, result: string): Response {
  return Response.json(
    { result },
    { status, headers: { 'cache-control': 'no-store', 'content-type': 'application/json' } },
  )
}

/** Return the configured Supabase URL and public API key. */
function database(env: ReportEnv): { url: string; key: string } | null {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL
  const key = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY
  return url && key ? { url: url.replace(/\/$/, ''), key } : null
}

/** Parse one bounded report body without retaining unknown fields. */
async function parseReport(request: Request): Promise<ReportInput | 'large' | null> {
  const declared = Number(request.headers.get('content-length') ?? 0)
  if (Number.isFinite(declared) && declared > REPORT_LIMITS.requestBytes) return 'large'
  let bytes: ArrayBuffer
  try {
    bytes = await request.arrayBuffer()
  } catch {
    return null
  }
  if (bytes.byteLength > REPORT_LIMITS.requestBytes) return 'large'
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
): Promise<boolean> {
  const body = new FormData()
  body.set('secret', env.TURNSTILE_SECRET_KEY ?? '')
  body.set('response', input.challenge)
  body.set('remoteip', network)
  body.set('idempotency_key', crypto.randomUUID())
  try {
    const response = await fetcher(TURNSTILE_VERIFY, { method: 'POST', body })
    if (!response.ok) return false
    const verdict = (await response.json()) as Record<string, unknown>
    const hosts = new Set(
      (env.REPORT_ALLOWED_HOSTS ?? '')
        .split(',')
        .map((host) => host.trim().toLowerCase())
        .filter(Boolean),
    )
    return (
      verdict.success === true &&
      verdict.action === 'report' &&
      typeof verdict.hostname === 'string' &&
      hosts.has(verdict.hostname.toLowerCase())
    )
  } catch {
    return false
  }
}

/** Confirm that the capability still names a currently published row. */
async function publishedShare(
  input: ReportInput,
  env: ReportEnv,
  fetcher: Fetcher,
): Promise<boolean> {
  const db = database(env)
  if (!db) return false
  try {
    const response = await fetcher(`${db.url}/rest/v1/rpc/share`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: db.key,
        authorization: `Bearer ${db.key}`,
      },
      body: JSON.stringify({ want: input.code }),
    })
    if (!response.ok) return false
    const value: unknown = await response.json()
    return (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      !('taken_down' in value)
    )
  } catch {
    return false
  }
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
): Promise<string | null> {
  const db = database(env)
  if (!db || !env.REPORT_FINGERPRINT_KEY || !env.REPORT_INGRESS_TOKEN) return null
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
  try {
    const response = await fetcher(`${db.url}/rest/v1/rpc/accept_share_report`, {
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
    })
    return response.ok ? ((await response.json()) as string) : null
  } catch {
    return null
  }
}

/** Accept one anonymous report through challenge, publication, quota, and insertion gates. */
export async function handleReportRequest(
  request: Request,
  env: ReportEnv,
  fetcher: Fetcher = fetch,
): Promise<Response> {
  if (request.method !== 'POST') return answer(405, 'failed')
  if (request.headers.get('content-type')?.split(';', 1)[0].trim() !== 'application/json') {
    return answer(415, 'failed')
  }
  if (
    !database(env) ||
    !env.REPORT_INGRESS_TOKEN ||
    !env.TURNSTILE_SECRET_KEY ||
    !env.REPORT_FINGERPRINT_KEY ||
    !env.REPORT_ALLOWED_HOSTS
  ) {
    return answer(503, 'unavailable')
  }
  const parsed = await parseReport(request)
  if (parsed === 'large') return answer(413, 'failed')
  if (!parsed) return answer(400, 'failed')
  const network = request.headers.get('cf-connecting-ip')?.trim()
  if (!network || network.length > 64) return answer(400, 'failed')
  if (!(await verifyChallenge(parsed, network, env, fetcher))) return answer(403, 'failed')
  if (!(await publishedShare(parsed, env, fetcher))) return answer(404, 'failed')
  const outcome = await insertReport(parsed, network, env, fetcher)
  if (outcome === 'accepted') return answer(201, 'ok')
  if (outcome === 'duplicate') return answer(409, 'failed')
  if (outcome === 'share_limited' || outcome === 'network_limited') return answer(429, 'failed')
  if (outcome === 'missing') return answer(404, 'failed')
  if (outcome === 'invalid') return answer(400, 'failed')
  return answer(503, 'unavailable')
}
