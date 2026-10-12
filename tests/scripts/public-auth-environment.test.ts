// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

import { describe, expect, it } from 'vitest'
import { publicAuthEnvironment } from '../../scripts/public-auth-environment.mjs'

const url = 'https://abcdefghijklmnopqrst.supabase.co'
const anonKey = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role: 'anon', ref: 'abcdefghijklmnopqrst' })).toString('base64url')}.mock-signature`

describe('assembled public auth environment', () => {
  it('gives site and console the same public project and key', () => {
    expect(
      publicAuthEnvironment({ VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: anonKey }),
    ).toEqual({
      VITE_SUPABASE_URL: url,
      VITE_SUPABASE_ANON_KEY: anonKey,
      PUBLIC_SUPABASE_URL: url,
      PUBLIC_SUPABASE_ANON_KEY: anonKey,
    })
  })

  it.each([
    { PUBLIC_SUPABASE_URL: 'https://zyxwvutsrqponmlkjihg.supabase.co' },
    { PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_different' },
    { VITE_SUPABASE_ANON_KEY: '' },
    { VITE_SUPABASE_URL: '' },
    { VITE_SUPABASE_URL: 'https://example.com' },
    { VITE_SUPABASE_ANON_KEY: 'sb_secret_forbidden' },
    {
      VITE_SUPABASE_ANON_KEY: `header.${Buffer.from('{"role":"service_role"}').toString('base64url')}.signature`,
    },
    { VITE_SUPABASE_ANON_KEY: 'not-a-public-key' },
    {
      VITE_SUPABASE_ANON_KEY: `header.${Buffer.from('{"role":"anon","ref":"zyxwvutsrqponmlkjihg"}').toString('base64url')}.signature`,
    },
  ])('stops conflicting, incomplete, or non-public browser configuration: %j', (overrides) => {
    expect(() =>
      publicAuthEnvironment({
        VITE_SUPABASE_URL: url,
        VITE_SUPABASE_ANON_KEY: anonKey,
        ...overrides,
      }),
    ).toThrow()
  })

  it('keeps both clients disabled without public deployment inputs, ignoring server credentials', () => {
    expect(
      publicAuthEnvironment({
        SUPABASE_URL: url,
        SUPABASE_SERVICE_ROLE_KEY: 'never-use',
        RESEND_API_KEY: 'never-use',
      }),
    ).toEqual({
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_ANON_KEY: '',
      PUBLIC_SUPABASE_URL: '',
      PUBLIC_SUPABASE_ANON_KEY: '',
    })
    expect(() =>
      publicAuthEnvironment({ PUBLIC_SUPABASE_URL: url, PUBLIC_SUPABASE_ANON_KEY: anonKey }),
    ).toThrow()
  })

  it('accepts matching aliases, trailing slash normalization, and publishable keys', () => {
    expect(
      publicAuthEnvironment({
        VITE_SUPABASE_URL: `${url}/`,
        VITE_SUPABASE_ANON_KEY: 'sb_publishable_mock',
        PUBLIC_SUPABASE_URL: url,
        PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_mock',
      }),
    ).toMatchObject({
      VITE_SUPABASE_URL: url,
      PUBLIC_SUPABASE_URL: url,
      PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_mock',
    })
  })
})
