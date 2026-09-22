// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

const required = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_TURNSTILE_SITE_KEY']
const missing = required.filter((name) => !process.env[name]?.trim())
if (missing.length) {
  console.error(`Missing hosted build variables: ${missing.join(', ')}`)
  process.exit(1)
}
console.log('Hosted build variables are present.')
