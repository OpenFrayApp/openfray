// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

import { pathToFileURL } from 'node:url'

/** Accept one normalized calendar date from the deployed public manifest. */
function normalizedDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

/** Verify successful Pages publication before invoking the private legal registration hook. */
export async function registerPublishedLegalDates(options) {
  const {
    mode,
    approval,
    accountId,
    project,
    apiToken,
    functionUrl,
    hook,
    expectedRevision,
    baseline,
  } = options
  if (
    !['production', 'staging'].includes(mode) ||
    approval !== mode ||
    !accountId ||
    !project ||
    !apiToken ||
    !hook ||
    !/^https:\/\/[a-z0-9-]+\.supabase\.co\/functions\/v1\/legal-publication$/.test(
      functionUrl ?? '',
    ) ||
    !/^[a-f0-9]{40}$/.test(expectedRevision ?? '') ||
    typeof baseline !== 'boolean'
  )
    throw new Error('Publication configuration requires approval')
  const origin = mode === 'production' ? 'https://openfray.app' : options.stagingOrigin
  if (
    !origin ||
    !/^https:\/\/[a-z0-9.-]+$/.test(origin) ||
    (mode === 'staging' && new URL(origin).hostname === 'openfray.app')
  )
    throw new Error('Staging requires an isolated site')
  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/pages/projects/${encodeURIComponent(project)}`,
      {
        headers: { Authorization: `Bearer ${apiToken}` },
        signal: AbortSignal.timeout(15000),
        redirect: 'error',
      },
    )
    if (!response.ok) throw new Error('Provider unavailable')
    const observed = await response.json()
    const deployment =
      mode === 'production'
        ? observed.result?.canonical_deployment
        : observed.result?.latest_deployment
    const trigger = deployment?.deployment_trigger?.metadata
    if (
      observed.success !== true ||
      deployment?.environment !== (mode === 'production' ? 'production' : 'preview') ||
      deployment.is_skipped !== false ||
      deployment.latest_stage?.name !== 'deploy' ||
      deployment.latest_stage.status !== 'success' ||
      trigger?.branch !== (mode === 'production' ? 'main' : 'develop') ||
      trigger.commit_dirty !== false ||
      trigger.commit_hash !== expectedRevision
    )
      throw new Error('Deployment not published')
    const ended = deployment.latest_stage.ended_on
    if (
      typeof ended !== 'string' ||
      !Number.isFinite(Date.parse(ended)) ||
      Date.parse(ended) > Date.now()
    )
      throw new Error('Invalid publication time')
    const publishedAt = new Date(ended).toISOString()
    const live = await fetch(`${origin}/legal-publication.json?revision=${expectedRevision}`, {
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    })
    if (!live.ok) throw new Error('Unpublished metadata')
    const metadata = await live.json()
    if (
      metadata?.schemaVersion !== 1 ||
      metadata.revision !== expectedRevision ||
      !normalizedDate(metadata.terms) ||
      !normalizedDate(metadata.privacy) ||
      metadata.terms > publishedAt.slice(0, 10) ||
      metadata.privacy > publishedAt.slice(0, 10)
    )
      throw new Error('Live revision differs')
    const registered = await fetch(functionUrl, {
      method: 'POST',
      headers: { 'x-openfray-hook': hook, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        revision: expectedRevision,
        publishedAt,
        terms: metadata.terms,
        privacy: metadata.privacy,
        baseline,
      }),
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    })
    if (!registered.ok) throw new Error('Registration unavailable')
    const result = await registered.json()
    if (!['baseline', 'unchanged', 'terms', 'privacy', 'combined'].includes(result?.result))
      throw new Error('Invalid registration')
    return { result: result.result, revision: expectedRevision }
  } catch {
    throw new Error('Publication verification unavailable')
  }
}

/** Retry the post-publication check while Pages completes, without changing deployment or sending configuration. */
async function main() {
  const baseline = process.env.LEGAL_BASELINE === 'true'
  if (!['true', 'false'].includes(process.env.LEGAL_BASELINE ?? ''))
    throw new Error('Choose baseline explicitly')
  const options = {
    mode: process.env.LEGAL_PUBLICATION_MODE,
    approval: process.env.LEGAL_PUBLICATION_APPROVED,
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    project: process.env.CLOUDFLARE_PAGES_PROJECT,
    apiToken: process.env.CLOUDFLARE_API_TOKEN,
    functionUrl: process.env.LEGAL_PUBLICATION_FUNCTION_URL,
    hook: process.env.LEGAL_PUBLICATION_HOOK_KEY,
    expectedRevision: process.env.LEGAL_EXPECTED_REVISION,
    stagingOrigin: process.env.LEGAL_STAGING_ORIGIN,
    baseline,
  }
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      console.log(JSON.stringify(await registerPublishedLegalDates(options)))
      return
    } catch {
      if (attempt === 39) throw new Error('Publication verification unavailable')
    }
    await new Promise((resolve) => setTimeout(resolve, 30000))
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch(() => {
    console.error('Legal publication blocked or unavailable. Review deployment and configuration.')
    process.exitCode = 1
  })
