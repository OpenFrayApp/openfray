// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

/** Follow preview redirects only while every request stays on the preview origin. */
export async function fetchPreview(input: string | URL, origin: string): Promise<Response> {
  let url = new URL(input, origin)
  for (let redirects = 0; redirects <= 10; redirects++) {
    if (url.origin !== new URL(origin).origin) {
      throw new Error('Preview requests must remain same-origin.')
    }
    const response = await fetch(url, { redirect: 'manual' })
    if (![301, 302, 303, 307, 308].includes(response.status)) return response
    const location = response.headers.get('location')
    if (!location) throw new Error('Preview redirect must supply a location.')
    url = new URL(location, url)
  }
  throw new Error('Preview redirect limit exceeded.')
}

/** Download only same-origin scripts referenced by an assembled preview document. */
export async function fetchPreviewScripts(html: string, origin: string) {
  const scripts = [...html.matchAll(/<script\b([^>]*)>/gi)]
    .map((match) => ({
      source: match[1].match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1],
      module: /\btype\s*=\s*["']module["']/i.test(match[1]),
    }))
    .filter((script) => script.source)
    .map((script) => ({ url: new URL(script.source!, origin), module: script.module }))
    .filter((script) => script.url.origin === new URL(origin).origin)
  if (!scripts.some((script) => script.module)) {
    throw new Error('Preview HTML must reference at least one local module.')
  }
  return Promise.all(
    scripts.map(async ({ url }) => ({ url, response: await fetchPreview(url, origin) })),
  )
}
