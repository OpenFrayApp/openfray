// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

/** Map the deployment's public Supabase inputs to both browser builds. */
export function publicAuthEnvironment(env) {
  const url = (env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
  const key = env.VITE_SUPABASE_ANON_KEY || ''
  if (Boolean(url) !== Boolean(key)) {
    throw new Error('Set both VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY or neither.')
  }
  if (
    (env.PUBLIC_SUPABASE_URL && env.PUBLIC_SUPABASE_URL.replace(/\/$/, '') !== url) ||
    (env.PUBLIC_SUPABASE_ANON_KEY && env.PUBLIC_SUPABASE_ANON_KEY !== key)
  ) {
    throw new Error('PUBLIC_SUPABASE configuration conflicts with the deployment VITE inputs.')
  }
  if (url) {
    if (!/^https:\/\/[a-z]{20}\.supabase\.co$/.test(url)) {
      throw new Error('VITE_SUPABASE_URL must name one hosted Supabase HTTPS origin.')
    }
    if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
      let claims
      try {
        const parts = key.split('.')
        if (parts.length !== 3) throw new Error('Invalid JWT')
        claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
      } catch {
        throw new Error('VITE_SUPABASE_ANON_KEY must be a public anon or publishable key.')
      }
      if (
        claims?.role !== 'anon' ||
        (claims.ref && claims.ref !== new URL(url).hostname.split('.')[0])
      ) {
        throw new Error('VITE_SUPABASE_ANON_KEY must be an anon key for the configured project.')
      }
    }
  }
  return {
    VITE_SUPABASE_URL: url,
    VITE_SUPABASE_ANON_KEY: key,
    PUBLIC_SUPABASE_URL: url,
    PUBLIC_SUPABASE_ANON_KEY: key,
  }
}
