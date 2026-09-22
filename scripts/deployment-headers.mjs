// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

/** Bind the policy's Supabase connections to the same project as the console build. */
export function deploymentHeaders(template, supabaseUrl) {
  if (!supabaseUrl) return template
  if (!/^https:\/\/[a-z]{20}\.supabase\.co\/?$/.test(supabaseUrl)) {
    throw new Error('VITE_SUPABASE_URL must name one hosted Supabase HTTPS origin.')
  }
  const host = new URL(supabaseUrl).host
  return template.replace(/^  Content-Security-Policy: .+$/gm, (policy) =>
    policy.replace(
      /\b(https|wss):\/\/[a-z]{20}\.supabase\.co\b/g,
      (_, protocol) => `${protocol}://${host}`,
    ),
  )
}
