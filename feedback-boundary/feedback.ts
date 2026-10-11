// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

import {
  feedbackDraft,
  feedbackText,
  feedbackCategoryLabel,
  FEEDBACK_LIMITS,
  type FeedbackDraft,
} from '../console/src/feedback/index.ts'
import {
  boundedJson,
  identifyResponse,
  publicRequestId,
  readBoundedBody,
  remainingTime,
  routeRateLimiter,
  PUBLIC_ROUTE_POLICIES,
  type PublicRouteEnv,
} from '../public-boundary/route.ts'

export interface FeedbackEnv extends PublicRouteEnv {
  TURNSTILE_SECRET_KEY?: string
  FEEDBACK_ALLOWED_HOSTS?: string
  FEEDBACK_GITHUB_TOKEN?: string
  RESEND_API_KEY?: string
  FEEDBACK_EMAIL_FROM?: string
}
type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

/** Return one uncached feedback result without provider or authored diagnostics. */
function answer(status: number, result: object, requestId: string): Response {
  return identifyResponse(
    Response.json(result, { status, headers: { 'cache-control': 'no-store' } }),
    requestId,
  )
}

/** Verify the challenge against the deployment hostname before any delivery attempt. */
async function verify(
  challenge: string,
  network: string,
  env: FeedbackEnv,
  fetcher: Fetcher,
  deadline: number,
): Promise<boolean> {
  const body = new FormData()
  body.set('secret', env.TURNSTILE_SECRET_KEY!)
  body.set('response', challenge)
  body.set('remoteip', network)
  const result = await boundedJson(
    fetcher,
    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    { method: 'POST', body },
    { timeoutMs: Math.min(3_000, remainingTime(deadline)), responseBytes: 8_192 },
  )
  if (
    result.status !== 'ok' ||
    !result.response.ok ||
    !result.value ||
    typeof result.value !== 'object'
  )
    return false
  const row = result.value as Record<string, unknown>
  const hosts = env.FEEDBACK_ALLOWED_HOSTS!.split(',').map((host) => host.trim().toLowerCase())
  return (
    row.success === true &&
    row.action === 'report' &&
    typeof row.hostname === 'string' &&
    hosts.includes(row.hostname.toLowerCase())
  )
}

/** Create a public issue, then apply triage metadata without duplicating successful creation. */
async function issue(
  draft: FeedbackDraft,
  env: FeedbackEnv,
  fetcher: Fetcher,
  deadline: number,
): Promise<string | null> {
  if (!env.FEEDBACK_GITHUB_TOKEN || Date.now() >= deadline) return null
  const base = 'https://api.github.com/repos/OpenFrayApp/console/issues'
  const headers = {
    authorization: `Bearer ${env.FEEDBACK_GITHUB_TOKEN}`,
    'content-type': 'application/json',
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    'user-agent': 'OpenFray-feedback',
  }
  const created = await boundedJson(
    fetcher,
    base,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ title: draft.title, body: feedbackText(draft) }),
    },
    { timeoutMs: Math.min(4_000, remainingTime(deadline)), responseBytes: 65_536 },
  )
  if (
    created.status !== 'ok' ||
    created.response.status !== 201 ||
    !created.value ||
    typeof created.value !== 'object'
  )
    return null
  const row = created.value as Record<string, unknown>
  if (typeof row.number !== 'number' || !Number.isSafeInteger(row.number) || row.number <= 0)
    return null
  const url = `https://github.com/OpenFrayApp/console/issues/${row.number}`
  const labels = [
    'needs-triage',
    ...(draft.category === 'bug' ? ['bug'] : draft.category === 'feature' ? ['enhancement'] : []),
  ]
  // GitHub assignment re-emits existing label events, so assign the unlabeled issue first.
  for (const { path, body } of [
    { path: 'assignees', body: { assignees: ['SirDarcanos'] } },
    { path: 'labels', body: { labels } },
  ]) {
    const metadata = await boundedJson(
      fetcher,
      `${base}/${row.number}/${path}`,
      { method: 'POST', headers, body: JSON.stringify(body) },
      { timeoutMs: Math.min(2_000, remainingTime(deadline)), responseBytes: 65_536 },
    )
    if (metadata.status !== 'ok' || !metadata.response.ok)
      console.warn(
        JSON.stringify({ kind: 'feedback-metadata', operation: path, outcome: 'failed' }),
      )
  }
  return url
}

/** Send one private or fallback notification to the fixed maintainer mailbox. */
async function email(
  draft: FeedbackDraft,
  env: FeedbackEnv,
  fetcher: Fetcher,
  deadline: number,
): Promise<boolean> {
  if (!env.RESEND_API_KEY || !env.FEEDBACK_EMAIL_FROM || Date.now() >= deadline) return false
  const category = feedbackCategoryLabel(draft.category)
  const result = await boundedJson(
    fetcher,
    'https://api.resend.com/emails',
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: env.FEEDBACK_EMAIL_FROM,
        to: ['reports@openfray.app'],
        subject: `[${category}] ${draft.title}`,
        text: feedbackText(draft),
      }),
    },
    { timeoutMs: Math.min(5_000, remainingTime(deadline)), responseBytes: 8_192 },
  )
  return (
    result.status === 'ok' &&
    result.response.ok &&
    !!result.value &&
    typeof result.value === 'object' &&
    typeof (result.value as Record<string, unknown>).id === 'string'
  )
}

/** Accept anonymous feedback only after bounded validation, rate limiting, and verification. */
export async function handleFeedbackRequest(
  request: Request,
  env: FeedbackEnv,
  fetcher: Fetcher = fetch,
): Promise<Response> {
  const requestId = publicRequestId()
  const deadline = Date.now() + PUBLIC_ROUTE_POLICIES.feedback.timeoutMs
  if (request.method !== 'POST') return answer(405, { result: 'failed' }, requestId)
  if (request.headers.get('content-type')?.split(';', 1)[0].trim() !== 'application/json')
    return answer(415, { result: 'failed' }, requestId)
  const allowed = await routeRateLimiter(env).allow(request, PUBLIC_ROUTE_POLICIES.feedback)
  if (allowed !== true)
    return answer(allowed === 'unavailable' ? 503 : 429, { result: 'failed' }, requestId)
  if (!env.TURNSTILE_SECRET_KEY || !env.FEEDBACK_ALLOWED_HOSTS)
    return answer(503, { result: 'failed' }, requestId)
  const bytes = await readBoundedBody(
    request,
    FEEDBACK_LIMITS.requestBytes,
    AbortSignal.timeout(remainingTime(deadline)),
  )
  if (bytes === 'large') return answer(413, { result: 'failed' }, requestId)
  if (!bytes || bytes === 'timed_out') return answer(400, { result: 'failed' }, requestId)
  let value: unknown
  try {
    value = JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    return answer(400, { result: 'failed' }, requestId)
  }
  const draft = feedbackDraft(value)
  const challenge =
    value && typeof value === 'object' ? (value as Record<string, unknown>).challenge : undefined
  const network = request.headers.get('cf-connecting-ip')?.trim()
  if (
    !draft ||
    typeof challenge !== 'string' ||
    !challenge ||
    challenge.length > 2_048 ||
    !network ||
    network.length > 64
  )
    return answer(400, { result: 'failed' }, requestId)
  if (!(await verify(challenge, network, env, fetcher, deadline)))
    return answer(403, { result: 'failed' }, requestId)
  if (draft.category !== 'security') {
    const url = await issue(draft, env, fetcher, deadline)
    if (url) return answer(201, { result: 'issue', url }, requestId)
  }
  return (await email(draft, env, fetcher, deadline))
    ? answer(201, { result: 'email' }, requestId)
    : answer(503, { result: 'failed' }, requestId)
}
