// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

import { expect, it, vi } from 'vitest'
import { handleFeedbackRequest, type FeedbackEnv } from '../../feedback-boundary/feedback.ts'

const env: FeedbackEnv = {
  TURNSTILE_SECRET_KEY: 'challenge-secret',
  FEEDBACK_ALLOWED_HOSTS: 'openfray.app',
  FEEDBACK_GITHUB_TOKEN: 'github-secret',
  RESEND_API_KEY: 'email-secret',
  FEEDBACK_EMAIL_FROM: 'OpenFray <feedback@openfray.app>',
  PUBLIC_ROUTE_LIMITER: { allow: async () => true },
}

/** Create a synthetic anonymous feedback request. */
function request(category = 'security', extra = {}) {
  return new Request('https://openfray.app/api/feedback', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': '192.0.2.1' },
    body: JSON.stringify({
      category,
      title: 'Synthetic report',
      description: 'Synthetic details',
      challenge: 'token',
      ...extra,
    }),
  })
}

it('creates a public bug issue with triage labels and the fixed assignee', async () => {
  const network = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ success: true, action: 'report', hostname: 'openfray.app' }),
    )
    .mockResolvedValueOnce(
      Response.json(
        { number: 42, html_url: 'https://github.com/OpenFrayApp/console/issues/42' },
        { status: 201 },
      ),
    )
    .mockResolvedValueOnce(Response.json({}))
    .mockResolvedValueOnce(Response.json({}))
  const response = await handleFeedbackRequest(request('bug'), env, network)
  expect(await response.json()).toEqual({
    result: 'issue',
    url: 'https://github.com/OpenFrayApp/console/issues/42',
  })
  expect(JSON.parse(network.mock.calls[1][1].body)).toEqual({
    title: 'Synthetic report',
    body: 'Category: Bug\n\nSynthetic details',
  })
  expect(network).toHaveBeenCalledTimes(4)
  expect(network.mock.calls[2][0]).toBe(
    'https://api.github.com/repos/OpenFrayApp/console/issues/42/assignees',
  )
  expect(JSON.parse(network.mock.calls[2][1].body)).toEqual({ assignees: ['SirDarcanos'] })
  expect(network.mock.calls[3][0]).toBe(
    'https://api.github.com/repos/OpenFrayApp/console/issues/42/labels',
  )
  expect(JSON.parse(network.mock.calls[3][1].body)).toEqual({ labels: ['needs-triage', 'bug'] })
})

it('waits for assignment to finish before adding labels', async () => {
  let finishAssignment!: (response: Response) => void
  const network = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ success: true, action: 'report', hostname: 'openfray.app' }),
    )
    .mockResolvedValueOnce(Response.json({ number: 42 }, { status: 201 }))
    .mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finishAssignment = resolve
        }),
    )
    .mockResolvedValueOnce(Response.json({}))
  const pending = handleFeedbackRequest(request('bug'), env, network)
  await vi.waitFor(() => expect(network).toHaveBeenCalledTimes(3))
  expect(network.mock.calls.some(([url]) => String(url).endsWith('/labels'))).toBe(false)
  finishAssignment(Response.json({}))
  expect((await pending).status).toBe(201)
  expect(network.mock.calls[3][0]).toBe(
    'https://api.github.com/repos/OpenFrayApp/console/issues/42/labels',
  )
})

it('sends Security privately by email without calling GitHub', async () => {
  const network = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ success: true, action: 'report', hostname: 'openfray.app' }),
    )
    .mockResolvedValueOnce(Response.json({ id: 'email-id' }))
  const response = await handleFeedbackRequest(request(), env, network)
  expect(response.status).toBe(201)
  expect(await response.json()).toEqual({ result: 'email' })
  expect(network.mock.calls.map(([url]) => url)).toEqual([
    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    'https://api.resend.com/emails',
  ])
  expect(JSON.parse(network.mock.calls[1][1].body)).toMatchObject({
    to: ['reports@openfray.app'],
    subject: '[Security] Synthetic report',
  })
})

it.each(['feature', 'question', 'other', 'unsure'])(
  'falls back to email when %s issue creation fails',
  async (category) => {
    const network = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ success: true, action: 'report', hostname: 'openfray.app' }),
      )
      .mockRejectedValueOnce(new Error('upstream-secret'))
      .mockResolvedValueOnce(Response.json({ id: 'email-id' }))
    const response = await handleFeedbackRequest(request(category), env, network)
    expect(await response.json()).toEqual({ result: 'email' })
    expect(network.mock.calls[2][0]).toBe('https://api.resend.com/emails')
  },
)

it('does not email again when issue metadata fails after confirmed creation', async () => {
  const log = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  try {
    const network = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ success: true, action: 'report', hostname: 'openfray.app' }),
      )
      .mockResolvedValueOnce(Response.json({ number: 42 }, { status: 201 }))
      .mockResolvedValue(Response.json({ message: 'sensitive-provider-detail' }, { status: 403 }))
    const response = await handleFeedbackRequest(request('feature'), env, network)
    expect(await response.json()).toEqual({
      result: 'issue',
      url: 'https://github.com/OpenFrayApp/console/issues/42',
    })
    expect(JSON.parse(network.mock.calls[3][1].body)).toEqual({
      labels: ['needs-triage', 'enhancement'],
    })
    expect(network.mock.calls.some(([url]) => url === 'https://api.resend.com/emails')).toBe(false)
    expect(log.mock.calls.flat().join(' ')).not.toContain('sensitive-provider-detail')
  } finally {
    log.mockRestore()
  }
})

it.each([false, 'unavailable'] as const)(
  'never sends rejected or unavailable rate-limit submissions',
  async (admission) => {
    const network = vi.fn()
    const response = await handleFeedbackRequest(
      request(),
      { ...env, PUBLIC_ROUTE_LIMITER: { allow: async () => admission } },
      network,
    )
    expect(response.status).toBe(admission === false ? 429 : 503)
    expect(network).not.toHaveBeenCalled()
  },
)

it.each([
  { success: false, action: 'report', hostname: 'openfray.app' },
  { success: true, action: 'other', hostname: 'openfray.app' },
  { success: true, action: 'report', hostname: 'evil.example' },
])('never sends a report rejected by Turnstile', async (verdict) => {
  const network = vi.fn().mockResolvedValue(Response.json(verdict))
  const response = await handleFeedbackRequest(request(), env, network)
  expect(response.status).toBe(403)
  expect(network).toHaveBeenCalledTimes(1)
})

it.each([
  { category: 'invalid' },
  { title: ' ' },
  { title: 'x'.repeat(257) },
  { title: 'two\nlines' },
  { description: '' },
  { description: 'x'.repeat(5_001) },
  { category: 'bug', expected: 'x'.repeat(2_001) },
  { challenge: '' },
  { challenge: 'x'.repeat(2_049) },
  { category: 'bug', details: { browser: 'Firefox' } },
])('rejects malformed input before contacting providers', async (input) => {
  const network = vi.fn()
  const response = await handleFeedbackRequest(request('security', input), env, network)
  expect(response.status).toBe(400)
  expect(network).not.toHaveBeenCalled()
})

it('bounds request bytes even when the character limits are not exhausted', async () => {
  const network = vi.fn()
  const response = await handleFeedbackRequest(
    request('bug', { description: 'x'.repeat(41_000) }),
    env,
    network,
  )
  expect(response.status).toBe(413)
  expect(network).not.toHaveBeenCalled()
})

it('keeps unknown fields, diagnostics, and expected behavior out of Security emails', async () => {
  const network = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ success: true, action: 'report', hostname: 'openfray.app' }),
    )
    .mockResolvedValueOnce(Response.json({ id: 'email-id' }))
  const response = await handleFeedbackRequest(
    request('security', {
      expected: 'hidden-secret',
      details: { browser: 'hidden-secret' },
      account: 'hidden-secret',
    }),
    env,
    network,
  )
  expect(response.status).toBe(201)
  expect(network.mock.calls[1][1].body).not.toContain('hidden-secret')
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect(response.headers.get('x-request-id')).toBeTruthy()
})

it('uses bounded GitHub deadlines and still attempts email after a timeout', async () => {
  const timeout = AbortSignal.timeout.bind(AbortSignal)
  const shortTimeout = vi
    .spyOn(AbortSignal, 'timeout')
    .mockImplementation((milliseconds) => timeout(Math.min(milliseconds, 20)))
  try {
    const network = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ success: true, action: 'report', hostname: 'openfray.app' }),
      )
      .mockReturnValueOnce(new Promise<Response>(() => undefined))
      .mockResolvedValueOnce(Response.json({ id: 'email-id' }))
    const response = await handleFeedbackRequest(request('bug'), env, network)
    expect(await response.json()).toEqual({ result: 'email' })
    expect(network.mock.calls[1][1].signal.aborted).toBe(true)
  } finally {
    shortTimeout.mockRestore()
  }
})

it('sends only the allowed bug diagnostic fields at the maximum authored lengths', async () => {
  const network = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ success: true, action: 'report', hostname: 'openfray.app' }),
    )
    .mockResolvedValueOnce(Response.json({ number: 42 }, { status: 201 }))
    .mockResolvedValue(Response.json({}))
  const response = await handleFeedbackRequest(
    request('bug', {
      title: 't'.repeat(256),
      description: 'd'.repeat(5_000),
      expected: 'e'.repeat(2_000),
      details: {
        browser: 'Firefox/140.0',
        os: 'Linux',
        viewport: '1280 × 800',
        creatures: 3,
        players: 2,
        npcs: 1,
        name: 'private-board-name',
      },
      account: 'private-account',
    }),
    env,
    network,
  )
  expect(response.status).toBe(201)
  const body = JSON.parse(network.mock.calls[1][1].body).body
  expect(body).toContain('Browser: Firefox/140.0')
  expect(body).toContain(
    'Creatures on board: 3\nPlayer characters on board: 2\nNonplayer characters on board: 1',
  )
  expect(body).not.toContain('private-')
})

it('rejects oversized upstream responses and attempts email', async () => {
  const network = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ success: true, action: 'report', hostname: 'openfray.app' }),
    )
    .mockResolvedValueOnce(Response.json({ data: 'x'.repeat(70_000) }, { status: 201 }))
    .mockResolvedValueOnce(Response.json({ id: 'email-id' }))
  expect(await (await handleFeedbackRequest(request('bug'), env, network)).json()).toEqual({
    result: 'email',
  })
})

it('rejects methods, media types, and missing verification configuration', async () => {
  const network = vi.fn()
  expect(
    (await handleFeedbackRequest(new Request('https://openfray.app/api/feedback'), env, network))
      .status,
  ).toBe(405)
  expect(
    (
      await handleFeedbackRequest(
        new Request('https://openfray.app/api/feedback', { method: 'POST', body: 'plain text' }),
        env,
        network,
      )
    ).status,
  ).toBe(415)
  expect(
    (await handleFeedbackRequest(request(), { ...env, TURNSTILE_SECRET_KEY: undefined }, network))
      .status,
  ).toBe(503)
  expect(network).not.toHaveBeenCalled()
})

it('returns only an unconfirmed failure when both providers fail', async () => {
  const network = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ success: true, action: 'report', hostname: 'openfray.app' }),
    )
    .mockResolvedValueOnce(Response.json({ message: 'private-upstream' }, { status: 500 }))
    .mockResolvedValueOnce(Response.json({ message: 'private-upstream' }, { status: 500 }))
  const response = await handleFeedbackRequest(request('bug'), env, network)
  expect(response.status).toBe(503)
  expect(await response.json()).toEqual({ result: 'failed' })
})
