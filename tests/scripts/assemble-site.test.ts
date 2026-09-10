// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PUBLICATION_SOURCE_MANIFEST } from '../../console/src/publication/index.ts'

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
  file('handbook/dist/index.html', '<html>docs</html>')
  file('brand/fonts/inter-500.ttf', 'ttf')
  file('brand/fonts/LICENSE.txt', 'the SIL Open Font License')
  file(
    'console/dist/console/index.html',
    [
      '<html><head><title>Combat console — OpenFray</title>',
      '<meta name="description" content="the console" />',
      '<meta property="og:title" content="Combat console — OpenFray" />',
      '<meta property="og:description" content="the console" />',
      '<meta property="og:url" content="https://openfray.app/console/" />',
      '<meta property="og:image" content="https://openfray.app/console/og-image.png" />',
      '<meta property="og:image:alt" content="OpenFray — a DnD 5e combat console for Game Masters" />',
      '<meta name="twitter:title" content="Combat console — OpenFray" />',
      '<meta name="twitter:description" content="the console" />',
      '<meta name="twitter:image" content="https://openfray.app/console/og-image.png" />',
      '</head><body>app</body></html>',
    ].join(''),
  )
  for (const source of PUBLICATION_SOURCE_MANIFEST.sources) {
    const fileName = source.indexPath.replace(/\.index\.json$/, '.json')
    const id = source.id === 'srd-5.2' ? 'srd-5.2:goblin' : `${source.id}:fixture`
    const name = source.id === 'srd-5.2' ? 'Goblin' : 'Fixture creature'
    file(
      `console/dist/console/compendium/${fileName}`,
      JSON.stringify([{ id, name, size: 'Small', type: 'humanoid' }]),
    )
  }
  file(
    'console/dist/console/compendium/srd-spells.json',
    JSON.stringify([{ id: 'srd-5.2:fireball' }]),
  )
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

  // The Function that draws a share card reads these, and nothing else does. Generated
  // here rather than committed, so a corrected CR can't desync from a checked-in copy.
  it('writes a sidecar index beside every library of stat blocks', () => {
    const index = JSON.parse(
      readFileSync(join(dir, 'dist/console/compendium/srd-creatures.index.json'), 'utf8'),
    )
    expect(index['srd-5.2:goblin']).toEqual({ name: 'Goblin', size: 'Small', type: 'humanoid' })
    // Spells are never on a card, so a book of them gets no sidecar.
    expect(existsSync(join(dir, 'dist/console/compendium/srd-spells.index.json'))).toBe(false)
  })

  it('writes independently versioned publication evidence with an exact manifest hash', () => {
    const manifestBytes = readFileSync(
      join(dir, 'dist/publication-deployment-manifest.json'),
      'utf8',
    )
    const manifest = JSON.parse(manifestBytes)
    expect(manifest).toMatchObject({
      deploymentManifestVersion: 1,
      publicationInterfaceVersion: 1,
      publishedShareSchemaVersion: 1,
      sourceManifestVersion: 1,
    })
    expect(manifest.artifacts.sourceIndexes).toHaveLength(
      PUBLICATION_SOURCE_MANIFEST.sources.length,
    )
    expect(
      readFileSync(join(dir, 'dist/publication-deployment-manifest.sha256'), 'utf8').trim(),
    ).toBe(createHash('sha256').update(manifestBytes).digest('hex'))
  })

  // Satori draws the share cards and needs real font files. They are served as assets, and
  // the licence travels with them because the SIL Open Font License asks that it does.
  it('serves the card typeface, licence included', () => {
    expect(readFileSync(join(dir, 'dist/fonts/inter-500.ttf'), 'utf8')).toBe('ttf')
    expect(existsSync(join(dir, 'dist/fonts/LICENSE.txt'))).toBe(true)
  })

  it('removes /lab, the section-component demo, assets included', () => {
    expect(existsSync(join(dir, 'dist/lab'))).toBe(false)
  })

  it('writes the Pages redirects: slash normalisation, code rewrites, moved docs URLs', () => {
    const redirects = readFileSync(join(dir, 'dist/_redirects'), 'utf8')
    expect(redirects).toContain('/console            /console/             301')
    // The two links a Game Master pastes into a chat window resolve to their own shell,
    // and answer 200 doing it.
    expect(redirects).toContain('/s/*                /s/                   200')
    expect(redirects).toContain('/p/*                /p/                   200')
    expect(redirects).toContain('/console/play/*     /console/             200')
    expect(redirects).toContain('/docs               /docs/                301')
    expect(redirects).toMatch(/\/docs\/fight\/effects\/\s+\/docs\/guides\/effects\/\s+301/)
    // A first-layout URL whose slug moved across two reorganisations still lands in one hop.
    expect(redirects).toMatch(/\/docs\/concepts\/encounters\/\s+\/docs\/guides\/encounters\/\s+301/)
    expect(redirects.endsWith('\n')).toBe(true)
  })

  // Pages drops a rewrite whose destination ends in `.html` or `/index` as an infinite
  // loop against its own extension stripping, and says so nowhere but `wrangler pages
  // dev`. That is what kept /s/<code> answering 404 from launch until 2026-08-25.
  it('never points a 200 rewrite at an .html file', () => {
    const rewrites = readFileSync(join(dir, 'dist/_redirects'), 'utf8')
      .split('\n')
      .filter((line) => line.trim().endsWith('200'))
    expect(rewrites.length).toBeGreaterThan(0)
    for (const rule of rewrites) {
      const [, to] = rule.trim().split(/\s+/)
      expect(to).not.toMatch(/\.html$|\/index$/)
    }
  })

  // A rewrite is followed whether or not an asset matches the request, so one covering
  // /console/* would answer every script under /console/assets/ with the app shell.
  it('rewrites no prefix that holds real files', () => {
    const redirects = readFileSync(join(dir, 'dist/_redirects'), 'utf8')
    expect(redirects).not.toContain('/console/*')
  })

  // Deep links into the app that no rewrite can cover are answered by the closest
  // 404.html: the page renders, and the status stays 404.
  it('leaves the app shell as the console`s own 404 page', () => {
    expect(readFileSync(join(dir, 'dist/console/404.html'), 'utf8')).toContain('app')
    // Not at the root: the marketing site keeps its own, or every unknown URL there
    // would answer with the console.
    expect(readFileSync(join(dir, 'dist/404.html'), 'utf8')).not.toContain('app')
  })

  it('answers a shared link from inside its own root, not from the site`s', () => {
    // index.html is what the rewrite serves, and 404.html the same file again, in case
    // the rewrite is ever dropped: without either, a pasted /s/<code> lands on the
    // marketing site's 404 page and the encounter is lost.
    for (const root of ['s', 'p']) {
      expect(readFileSync(join(dir, `dist/${root}/index.html`), 'utf8')).toContain('app')
      expect(readFileSync(join(dir, `dist/${root}/404.html`), 'utf8')).toContain('app')
    }
  })

  it('tells a chat window which page a shared link is, and where it lives', () => {
    // The shell describes the console, because that is the page it usually is. Pasted into
    // a chat, these two are not, and nothing else gets a chance to say so: an unfurl reads
    // the tags and never runs the app.
    const shared = readFileSync(join(dir, 'dist/s/index.html'), 'utf8')
    expect(shared).toContain('<title>A shared encounter — OpenFray</title>')
    expect(shared).toContain('content="https://openfray.app/s/"')
    expect(shared).not.toContain('Combat console')
    expect(shared).not.toContain('openfray.app/console/"')

    const player = readFileSync(join(dir, 'dist/p/index.html'), 'utf8')
    expect(player).toContain('<title>Player view — OpenFray</title>')
    expect(player).toContain('content="https://openfray.app/p/"')
  })

  it('says nothing about the encounter behind the code', () => {
    // Every link under a prefix carries the same words. A scanner that follows one out of a
    // chat log learns no more than the person who was sent it chose to say.
    const shared = readFileSync(join(dir, 'dist/s/index.html'), 'utf8')
    expect(shared).toContain('Someone shared a Dungeons and Dragons 5e encounter with you')
    // The card's picture is the site's banner: it names nothing, and its address line is
    // the domain rather than the console the link doesn't go to.
    expect(shared).toContain('content="https://openfray.app/og-image.png"')
    expect(shared).not.toContain('/console/og-image.png')
  })

  // The alt text sat outside the image rewrite's pattern, which ends at a closing quote and
  // so never matched `og:image:alt`. Both shared shells described a picture neither shows.
  it('describes the picture the card actually carries', () => {
    const shared = readFileSync(join(dir, 'dist/s/index.html'), 'utf8')
    expect(shared).toContain(
      '<meta property="og:image:alt" content="OpenFray — a DnD 5e combat console for Game Masters" />',
    )
  })

  // Discord tints its embed's accent bar from this, so the chrome frames the card the
  // Function paints. The player view has no card to frame and keeps the console's shell.
  it('gives the shared-encounter shell the brand accent, and not the player view', () => {
    expect(readFileSync(join(dir, 'dist/s/index.html'), 'utf8')).toContain(
      '<meta name="theme-color" content="#6366f1" />',
    )
    expect(readFileSync(join(dir, 'dist/p/index.html'), 'utf8')).not.toContain('theme-color')
  })

  it('leaves the console`s own shell describing the console', () => {
    expect(readFileSync(join(dir, 'dist/console/404.html'), 'utf8')).toContain('Combat console')
  })

  it('overwrites the sitemap index to cover both the site and the handbook', () => {
    const sitemap = readFileSync(join(dir, 'dist/sitemap-index.xml'), 'utf8')
    expect(sitemap).toContain('https://openfray.app/sitemap-0.xml')
    expect(sitemap).toContain('https://openfray.app/docs/sitemap-0.xml')
    expect(sitemap).not.toContain('site-only')
  })
})
