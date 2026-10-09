// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { registerPublishedLegalDates } from '../../scripts/legal-publication.mjs'

const revision = 'a'.repeat(40)
const deployment = {
  id: 'deployment',
  environment: 'production',
  is_skipped: false,
  latest_stage: { name: 'deploy', status: 'success', ended_on: '2026-10-08T00:00:00Z' },
  deployment_trigger: { metadata: { branch: 'main', commit_hash: revision, commit_dirty: false } },
}
const metadata = { schemaVersion: 1, revision, terms: '2026-10-08', privacy: '2026-10-07' }
const options = {
  mode: 'production',
  approval: 'production',
  accountId: 'account',
  project: 'openfray',
  apiToken: 'cloudflare-secret',
  functionUrl: 'https://project.supabase.co/functions/v1/legal-publication',
  hook: 'hook-secret',
  expectedRevision: revision,
  baseline: false,
}
let registrations: unknown[]
beforeEach(() => {
  registrations = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith('https://api.cloudflare.com/'))
        return Response.json({ success: true, result: { canonical_deployment: deployment } })
      if (url.startsWith('https://openfray.app/legal-publication.json'))
        return Response.json(metadata)
      if (url === options.functionUrl) {
        registrations.push(JSON.parse(init!.body as string))
        return Response.json({ result: 'terms' })
      }
      throw new Error('unexpected request')
    }),
  )
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
it('registers only a successfully published production commit verified against live metadata', async () => {
  expect(await registerPublishedLegalDates(options)).toEqual({ result: 'terms', revision })
  expect(registrations).toEqual([
    {
      revision,
      publishedAt: '2026-10-08T00:00:00.000Z',
      terms: '2026-10-08',
      privacy: '2026-10-07',
      baseline: false,
    },
  ])
})
it('registers a clean develop preview against its isolated staging metadata and hook', async () => {
  const stagingOrigin = 'https://develop.example.test'
  const functionUrl = 'https://staging.supabase.co/functions/v1/legal-publication'
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    if (String(url).startsWith('https://api.cloudflare.com/'))
      return Response.json({
        success: true,
        result: {
          latest_deployment: {
            ...deployment,
            environment: 'preview',
            deployment_trigger: {
              metadata: { branch: 'develop', commit_hash: revision, commit_dirty: false },
            },
          },
        },
      })
    if (String(url).startsWith(`${stagingOrigin}/legal-publication.json`))
      return Response.json(metadata)
    if (String(url) === functionUrl) {
      registrations.push(JSON.parse(init!.body as string))
      return Response.json({ result: 'terms' })
    }
    throw new Error('Unexpected request outside staging')
  })
  expect(
    await registerPublishedLegalDates({
      ...options,
      mode: 'staging',
      approval: 'staging',
      stagingOrigin,
      functionUrl,
    }),
  ).toEqual({ result: 'terms', revision })
  expect(registrations).toHaveLength(1)
  expect(
    vi.mocked(fetch).mock.calls.some(([url]) => String(url).startsWith('https://openfray.app/')),
  ).toBe(false)
})

it.each(['staging', 'unknown', ''])('does not trigger production for mode %s', async (mode) => {
  await expect(registerPublishedLegalDates({ ...options, mode })).rejects.toThrow()
  expect(fetch).not.toHaveBeenCalled()
})
it.each(['failed', 'pending', 'preview', 'branch', 'dirty', 'revision', 'stale-live'])(
  'does not register %s deployment',
  async (scenario) => {
    vi.mocked(fetch).mockImplementation(async (url) => {
      if (String(url).startsWith('https://openfray.app/'))
        return Response.json({
          ...metadata,
          revision: scenario === 'stale-live' ? 'b'.repeat(40) : revision,
        })
      return Response.json({
        success: true,
        result: {
          canonical_deployment: {
            ...deployment,
            environment: scenario === 'preview' ? 'preview' : 'production',
            latest_stage: {
              ...deployment.latest_stage,
              status:
                scenario === 'failed' ? 'failure' : scenario === 'pending' ? 'active' : 'success',
            },
            deployment_trigger: {
              metadata: {
                branch: scenario === 'branch' ? 'develop' : 'main',
                commit_hash: scenario === 'revision' ? 'b'.repeat(40) : revision,
                commit_dirty: scenario === 'dirty',
              },
            },
          },
        },
      })
    })
    await expect(registerPublishedLegalDates(options)).rejects.toThrow()
    expect(registrations).toEqual([])
  },
)
it('requires environment approval and never prints provider bodies or credentials', async () => {
  await expect(registerPublishedLegalDates({ ...options, approval: '' })).rejects.toThrow()
  expect(fetch).not.toHaveBeenCalled()
  vi.mocked(fetch).mockRejectedValue(
    new Error('cloudflare-secret hook-secret private@example.test'),
  )
  await expect(registerPublishedLegalDates(options)).rejects.toThrow(
    'Publication verification unavailable',
  )
})
