// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const HEADER = readFileSync(resolve(__dirname, '../../cloudflare/_headers'), 'utf8')
const POLICY = HEADER.match(/^  Content-Security-Policy: (.+)$/m)?.[1] ?? ''

/** Parse the deployed policy into directive source lists. */
function directives(): Map<string, string[]> {
  return new Map(
    POLICY.split('; ').map((entry) => {
      const [name, ...sources] = entry.trim().split(/\s+/)
      return [name, sources]
    }),
  )
}

/** Return whether a representative resource is permitted by one policy directive. */
function allows(directive: string, resource: string): boolean {
  const policy = directives()
  const sources = policy.get(directive) ?? policy.get('default-src') ?? []
  if (sources.includes("'none'")) return false
  if (resource === 'inline') return sources.includes("'unsafe-inline'")
  const url = new URL(resource, 'https://openfray.app')
  if (url.origin === 'https://openfray.app' && sources.includes("'self'")) return true
  return sources.includes(url.origin)
}

describe('enforced Content Security Policy', () => {
  it('supports required console, player, share, authentication, and asset paths', () => {
    for (const path of [
      '/console/',
      '/console/play/synthetic',
      '/p/synthetic',
      '/s/synthetic',
      '/console/?code=oauth-callback',
      '/console/assets/app.js',
      '/console/compendium/srd-creatures.json',
    ]) {
      expect(allows('default-src', path), path).toBe(true)
    }
    expect(allows('connect-src', 'https://jhfjzzciubewzujafadj.supabase.co')).toBe(true)
    expect(allows('connect-src', 'wss://jhfjzzciubewzujafadj.supabase.co')).toBe(true)
  })

  it('supports deployed analytics and the report challenge', () => {
    expect(allows('script-src', 'https://cdn.usefathom.com/script.js')).toBe(true)
    expect(allows('connect-src', 'https://cdn.usefathom.com/api')).toBe(true)
    expect(allows('script-src', 'https://challenges.cloudflare.com/turnstile/v0/api.js')).toBe(true)
    expect(allows('connect-src', 'https://challenges.cloudflare.com/turnstile')).toBe(true)
    expect(allows('frame-src', 'https://challenges.cloudflare.com/turnstile')).toBe(true)
  })

  it('permits the authored inline assets emitted by the three builds', () => {
    expect(allows('script-src', 'inline')).toBe(true)
    expect(allows('style-src', 'inline')).toBe(true)
  })

  it.each([
    ['script-src', 'https://evil.example/payload.js'],
    ['style-src', 'https://evil.example/payload.css'],
    ['connect-src', 'https://evil.example/private'],
    ['frame-src', 'https://evil.example/embed'],
    ['img-src', 'https://evil.example/private.png'],
    ['font-src', 'https://evil.example/private.woff2'],
    ['media-src', 'https://evil.example/private.mp4'],
    ['worker-src', 'https://evil.example/private.js'],
    ['object-src', '/console/private.swf'],
  ])('blocks an unlisted %s resource', (directive, resource) => {
    expect(allows(directive, resource)).toBe(false)
  })

  it('reports enforced violations through the privacy boundary', () => {
    expect(POLICY).toContain('report-uri /api/csp-reports')
    expect(HEADER).not.toContain('Content-Security-Policy-Report-Only')
  })
})
