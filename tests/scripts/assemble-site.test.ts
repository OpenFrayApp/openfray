// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const SCRIPT = resolve(__dirname, '../../scripts/assemble-site.mjs')
let dir: string

/** Drop a file into the fixture, creating parent folders. */
function file(rel: string, content = '<html></html>'): void {
  const p = join(dir, rel)
  mkdirSync(join(p, '..'), { recursive: true })
  writeFileSync(p, content)
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'assemble-'))
  // The three build outputs assemble-site.mjs merges, in miniature.
  file('site/dist/index.html', '<html>home</html>')
  file('site/dist/404.html', '<html>site not found</html>')
  file('site/dist/privacy/index.html')
  file('site/dist/the-waking-garden/index.html')
  file('site/dist/the-waking-garden/print/index.html', '<html>print</html>')
  file('site/dist/brood-and-bloom/index.html')
  file('site/dist/brood-and-bloom/print/index.html', '<html>print</html>')
  file('site/dist/strong-waters/index.html')
  file('site/dist/strong-waters/print/index.html', '<html>print</html>')
  file('site/dist/lab/index.html', '<html>lab</html>')
  file('site/dist/lab/loop.mp4', 'mp4')
  file('site/dist/sitemap-index.xml', '<sitemapindex>site-only</sitemapindex>')
  file('docs/dist/index.html', '<html>docs</html>')
  file('console/dist/console/index.html', '<html>app</html>')
  execFileSync('node', [SCRIPT], { cwd: dir, stdio: 'pipe' })
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('assemble-site', () => {
  it('copies the site to the dist root and the handbook under /docs', () => {
    expect(readFileSync(join(dir, 'dist/index.html'), 'utf8')).toContain('home')
    expect(readFileSync(join(dir, 'dist/docs/index.html'), 'utf8')).toContain('docs')
    expect(existsSync(join(dir, 'dist/privacy/index.html'))).toBe(true)
  })

  it('leaves the Vite-built console where it is', () => {
    expect(readFileSync(join(dir, 'dist/console/index.html'), 'utf8')).toContain('app')
  })

  // Every book's print route, not just the first: a new book that forgets its rmSync
  // line publishes the print edition, and nothing else would catch it.
  it('removes every print edition — a local tool, never shipped', () => {
    for (const book of ['the-waking-garden', 'brood-and-bloom', 'strong-waters']) {
      expect(existsSync(join(dir, `dist/${book}/print`))).toBe(false)
      expect(existsSync(join(dir, `dist/${book}/index.html`))).toBe(true)
    }
  })

  it('removes /lab, the section-component demo, assets included', () => {
    expect(existsSync(join(dir, 'dist/lab'))).toBe(false)
  })

  it('writes the Pages redirects: slash normalisation, SPA fallback, moved docs URLs', () => {
    const redirects = readFileSync(join(dir, 'dist/_redirects'), 'utf8')
    expect(redirects).toContain('/console            /console/             301')
    expect(redirects).toContain('/console/*          /console/index.html   200')
    // The two links a Game Master pastes into a chat window resolve to the app shell.
    expect(redirects).toContain('/s/*                /console/index.html   200')
    expect(redirects).toContain('/p/*                /console/index.html   200')
    expect(redirects).toContain('/docs               /docs/                301')
    expect(redirects).toMatch(/\/docs\/fight\/effects\/\s+\/docs\/guides\/effects\/\s+301/)
    // A first-layout URL whose slug moved across two reorganisations still lands in one hop.
    expect(redirects).toMatch(/\/docs\/concepts\/encounters\/\s+\/docs\/guides\/encounters\/\s+301/)
    expect(redirects.endsWith('\n')).toBe(true)
  })

  // Deep links into the app — /console/play/<code> — are answered by the closest
  // 404.html rather than by the _redirects proxy, which has never fired on Pages.
  it('leaves the app shell as the console`s own 404 page', () => {
    expect(readFileSync(join(dir, 'dist/console/404.html'), 'utf8')).toContain('app')
    // Not at the root: the marketing site keeps its own, or every unknown URL there
    // would answer with the console.
    expect(readFileSync(join(dir, 'dist/404.html'), 'utf8')).not.toContain('app')
  })

  it('answers a shared link from inside its own root, not from the site`s', () => {
    // Same mechanism as the console's, scoped to the two shared paths. Without these a
    // pasted /s/<code> lands on the marketing site's 404 page and the encounter is lost.
    expect(readFileSync(join(dir, 'dist/s/404.html'), 'utf8')).toContain('app')
    expect(readFileSync(join(dir, 'dist/p/404.html'), 'utf8')).toContain('app')
  })

  it('overwrites the sitemap index to cover both the site and the handbook', () => {
    const sitemap = readFileSync(join(dir, 'dist/sitemap-index.xml'), 'utf8')
    expect(sitemap).toContain('https://openfray.app/sitemap-0.xml')
    expect(sitemap).toContain('https://openfray.app/docs/sitemap-0.xml')
    expect(sitemap).not.toContain('site-only')
  })
})
