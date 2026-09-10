// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

// Assembles dist/ for Cloudflare Pages. Vite builds the app into
// console/dist/console (base = /console/), Astro builds the marketing site into
// site/dist, and Starlight builds the handbook into handbook/dist (base = /docs/). This
// step copies each into the dist root and writes the Pages routing rules. Output
// dir for Pages is dist/.
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  rmSync,
} from 'node:fs'
import { CREATURES_SUFFIX, indexCreatures, indexFileFor } from './compendium-index.mjs'
import {
  PUBLICATION_INTERFACE_VERSION,
  PUBLISHED_SHARE_SCHEMA_VERSION,
  SOURCE_MANIFEST_VERSION,
  PUBLICATION_SOURCE_MANIFEST,
} from '../console/src/publication/index.ts'
import { createPublicationDeploymentManifest } from './publication-deployment-manifest.mjs'

// Site root (/) → the Astro-built marketing site (home, privacy, terms, 404).
cpSync('site/dist', 'dist', { recursive: true })

// Response policy belongs to the assembled deployment because it governs all three
// surfaces. Overwrite the site's build copy so a stale submodule header cannot ship.
copyFileSync('cloudflare/_headers', 'dist/_headers')

// /console → the Vite-built app. The console workspace builds into its own
// dist/console so the base path survives; copy it under the same path here.
cpSync('console/dist/console', 'dist/console', { recursive: true })

// A sidecar index beside each library of stat blocks, so the Function that draws a share
// card can name `srd-5.2:goblin` without parsing the book it lives in. Written here rather
// than committed because it is derived: a CR corrected in the compendium repo would
// otherwise desync from a checked-in copy of it.
const COMPENDIUM = 'dist/console/compendium'
const generatedIndexes = new Map()
if (existsSync(COMPENDIUM)) {
  for (const file of readdirSync(COMPENDIUM)) {
    if (!file.endsWith(CREATURES_SUFFIX)) continue
    const creatures = JSON.parse(readFileSync(`${COMPENDIUM}/${file}`, 'utf8'))
    const indexFile = indexFileFor(file)
    const bytes = JSON.stringify(indexCreatures(creatures))
    writeFileSync(`${COMPENDIUM}/${indexFile}`, bytes)
    generatedIndexes.set(indexFile, bytes)
  }
}

// The source manifest is console-owned authority. Assembly proves every declared source has
// an exact generated sidecar, then records hashes of the contract, manifest, and sidecars.
const sourceManifestBytes = `${JSON.stringify(PUBLICATION_SOURCE_MANIFEST, null, 2)}\n`
writeFileSync('dist/publication-source-manifest.json', sourceManifestBytes)
const sourceIndexes = PUBLICATION_SOURCE_MANIFEST.sources.map((source) => {
  const bytes = generatedIndexes.get(source.indexPath)
  if (bytes === undefined) throw new Error(`Missing publication source index: ${source.id}`)
  return {
    sourceId: source.id,
    path: `console/compendium/${source.indexPath}`,
    bytes,
  }
})
const publicationManifest = createPublicationDeploymentManifest({
  publicationInterfaceVersion: PUBLICATION_INTERFACE_VERSION,
  publishedShareSchemaVersion: PUBLISHED_SHARE_SCHEMA_VERSION,
  sourceManifestVersion: SOURCE_MANIFEST_VERSION,
  contractBytes: readFileSync(
    new URL('../console/src/publication/index.ts', import.meta.url),
    'utf8',
  ),
  sourceManifestBytes,
  sourceIndexes,
})
writeFileSync('dist/publication-deployment-manifest.json', publicationManifest.manifestBytes)
writeFileSync('dist/publication-deployment-manifest.sha256', `${publicationManifest.sha256}\n`)

// The typeface the share cards are drawn in. Satori needs real font files and cannot read
// the system stack the brand banner names, so Inter stands in for it. Served as static
// assets rather than compiled into the Worker: the Function fetches the weights it needs
// through env.ASSETS. `LICENSE.txt` travels with them because the SIL Open Font License
// asks that it does.
cpSync('brand/fonts', 'dist/fonts', { recursive: true })

// The print edition lives under src/pages so it renders through the site's own
// components, but it is a local tool for saving a PDF and never ships.
rmSync('dist/the-waking-garden/print', { recursive: true, force: true })
rmSync('dist/brood-and-bloom/print', { recursive: true, force: true })
rmSync('dist/strong-waters/print', { recursive: true, force: true })

// /lab is the same kind of local tool: the site's section components demoed on one
// page, for review before a real page composes them.
rmSync('dist/lab', { recursive: true, force: true })

// /docs → the Starlight handbook, built with base = /docs/ so its links and assets
// already point under /docs. Copy it in wholesale.
cpSync('handbook/dist', 'dist/docs', { recursive: true })

// The handbook is organised by Diátaxis quadrant: concepts/, guides/, and reference/,
// with the tutorial at /docs/getting-started/. Every URL an earlier layout used 301s
// to its final home here — the flat original, the fight/-library/ layout, and the
// first concepts/ layout whose slugs now host different pages. One hop only: each
// entry points at a live page, never at another entry's key.
const docsMoves = {
  // the fight/ and library/ layout (2026), now split across the quadrants
  '/docs/fight/combatants/': '/docs/concepts/combatants/',
  '/docs/fight/effects/': '/docs/guides/effects/',
  '/docs/fight/encounters/': '/docs/guides/encounters/',
  '/docs/fight/attacks/': '/docs/guides/attacks/',
  '/docs/fight/saves/': '/docs/guides/saves/',
  '/docs/fight/concentration/': '/docs/guides/concentration/',
  '/docs/fight/resources/': '/docs/guides/resources/',
  '/docs/fight/spells/': '/docs/guides/spells/',
  '/docs/fight/death/': '/docs/guides/death/',
  '/docs/fight/rests/': '/docs/guides/rests/',
  '/docs/fight/player-view/': '/docs/guides/player-view/',
  '/docs/fight/recap/': '/docs/guides/recap/',
  '/docs/fight/tracker/': '/docs/reference/tracker/',
  '/docs/library/compendium/': '/docs/reference/compendium/',
  '/docs/library/making-your-own/': '/docs/guides/making-your-own/',
  '/docs/library/campaigns/': '/docs/guides/campaigns/',
  '/docs/library/importer/': '/docs/guides/importer/',
  '/docs/account/': '/docs/concepts/account/',
  // the first concepts/ layout; combatants/ and effects/ are real pages again, so
  // only the slugs that moved elsewhere still redirect
  '/docs/concepts/encounters/': '/docs/guides/encounters/',
  '/docs/concepts/spells/': '/docs/guides/spells/',
  '/docs/concepts/rests/': '/docs/guides/rests/',
  '/docs/concepts/compendium/': '/docs/reference/compendium/',
  '/docs/concepts/making-your-own/': '/docs/guides/making-your-own/',
  '/docs/concepts/campaigns/': '/docs/guides/campaigns/',
  // the flat original
  '/docs/importer/': '/docs/guides/importer/',
}

// Pages routing: normalise the bare /console and /docs to their trailing-slash index,
// and rewrite the paths that carry a code in the URL onto the app shell, so they answer
// 200 instead of falling through to a 404 page. The docs are fully static, so they need
// no fallback. The site root is left to dist/index.html.
//
// Two rules govern a 200 rewrite here, and breaking either one is silent:
//
//   - The destination may not end in `.html` or `/index`. Pages strips those from a URL
//     of its own accord, reads the rule as a loop against that stripping, and drops it
//     ("Infinite loop detected in this rule and has been ignored", which only
//     `wrangler pages dev` ever prints). `/s/* → /console/index.html` was ignored from
//     launch until 2026-08-25 for this reason, and every /s/<code> answered 404.
//   - The source may only cover a prefix that holds no real files. A rewrite is followed
//     whether or not an asset matches, so `/console/* → /console/` would answer every
//     script under /console/assets/ with the shell. That is why the app's own deep links
//     rely on dist/console/404.html below, and only the code-carrying prefixes are
//     rewritten.
const redirects = [
  '/console            /console/             301',
  // The two surfaces a Game Master hands to someone else: /p/<code> is the table's
  // read-only player board, /s/<code> is a published encounter. They sit at the domain
  // root rather than under /console because they are pasted into a chat window, and the
  // app reads the code off the path either way. Each rewrites onto its own shell, which
  // is what lets the two describe themselves to whatever unfurls the link.
  '/s/*                /s/                   200',
  '/p/*                /p/                   200',
  // The app's own player-view path, from before the shared roots existed. Nothing but
  // the code sits under it, so it can be rewritten too.
  '/console/play/*     /console/             200',
  '/docs               /docs/                301',
  ...Object.entries(docsMoves).map(([from, to]) => `${from.padEnd(38)}${to}  301`),
  '',
].join('\n')
writeFileSync('dist/_redirects', redirects)

// The app shell again as the console's own 404 page. Pages looks for the closest
// `404.html` from the requested path upward, so this answers any other deep link into
// the app, which no rewrite can cover while real assets live under /console/. The page
// renders and `main.tsx` reads the path, but the status stays 404, so a link worth
// pasting into a chat belongs under /s/ or /p/. It has to be inside dist/console: at
// the root it would swallow every unknown path on the marketing site too.
copyFileSync('dist/console/index.html', 'dist/console/404.html')

// And the same shell under each shared root, as the rewrite's destination. Each also
// stays as that root's 404 page, which is what answers /s/<code> if the rewrite is ever
// dropped again. Both are scoped to their own directory, which is what makes them safe: a
// root-level 404.html would swallow every unknown path on the marketing site, including
// the ones the site's own 404 page is for.
//
// The shell it copies describes the console, because that is the page it usually is. On
// these two it is not, and the tags are what a chat window reads when somebody pastes the
// link: without this, every shared encounter unfurls as "Combat console" pointing at
// /console/, which is neither the page nor its address. So each copy gets its own.
//
// These are the fallback: what a link says about itself when no Function decorates it.
// `functions/s/[code].ts` swaps in per-share tags at the edge, and this is what stays if it
// is ever removed or fails to deploy.
//
// The tags here are the same for every link under a prefix, and once the HTML is written
// per request that stops being a fact of the build and becomes a choice. The choice made:
// name, cast and byline yes, the note no. A scanner holding the URL has already spent the
// 49 bits an unlisted link's privacy is made of, and what a targeted card adds is that it
// no longer has to render a JS app to triage the code. The note is the one field where a
// scanner would learn what the reader was sent rather than what the publisher chose to
// publish, so it never reaches a tag. `noindex` on both prefixes keeps them out of search
// either way.
const SHARED_SHELLS = {
  s: {
    title: 'A shared encounter — OpenFray',
    description:
      'Someone shared a Dungeons and Dragons 5e encounter with you. Open it to read the ' +
      'creatures, or add it to your own board.',
    alt: 'OpenFray — a DnD 5e combat console for Game Masters',
    // Discord tints its embed's left accent bar from this, so the chrome frames the card
    // the Function paints instead of fighting it. The player view has no card to frame.
    themeColor: '#6366f1',
  },
  p: {
    title: 'Player view — OpenFray',
    description:
      'A live, read-only view of the fight your Game Master is running. It shows what they ' +
      'choose to show.',
    alt: 'OpenFray — a DnD 5e combat console for Game Masters',
  },
}

// The card's picture is the site's banner, not the console's. They are the same drawing
// apart from the address along the bottom, and the console's reads openfray.app/console,
// which is not where either of these links goes. It names nothing about the encounter.
const BANNER = 'https://openfray.app/og-image.png'

/** The shell again, saying which of the two surfaces it is rather than which app it is. */
function sharedShell(html, root, { title, description, alt, themeColor }) {
  const url = `https://openfray.app/${root}/`
  const withTags = html
    .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
    .replace(
      /(<meta\s+(?:name|property)="(?:description|og:title|og:description|og:url|twitter:title|twitter:description)"[^>]*content=")[^"]*(")/g,
      (whole, open, close) => {
        if (whole.includes('og:url')) return `${open}${url}${close}`
        if (whole.includes('title')) return `${open}${title}${close}`
        return `${open}${description}${close}`
      },
    )
    // `og:image:alt` is matched here rather than with the two image URLs, whose pattern ends
    // at the closing quote and so never touched it: both shared shells carried the console's
    // alt text describing a picture neither of them shows.
    .replace(/(<meta\s+property="og:image:alt"[^>]*content=")[^"]*(")/, `$1${alt}$2`)
    .replace(
      /(<meta\s+(?:name|property)="(?:og:image|twitter:image)"[^>]*content=")[^"]*(")/g,
      `$1${BANNER}$2`,
    )
  if (!themeColor) return withTags
  return withTags.replace(
    /<title>/,
    `<meta name="theme-color" content="${themeColor}" />\n    <title>`,
  )
}

const shell = readFileSync('dist/console/index.html', 'utf8')
for (const [root, meta] of Object.entries(SHARED_SHELLS)) {
  mkdirSync(`dist/${root}`, { recursive: true })
  const html = sharedShell(shell, root, meta)
  writeFileSync(`dist/${root}/index.html`, html)
  writeFileSync(`dist/${root}/404.html`, html)
}

// One sitemap index at the domain root, covering both the marketing site and the
// handbook. Each part builds its own sitemap-0.xml (@astrojs/sitemap); the docs are a
// subfolder of the same site, so a single root index is the natural discovery point and
// doesn't depend on robots.txt. This overwrites the marketing-only index copied in from
// site/dist above. (A sitemap index must point at sitemap files, not other indexes.)
const sitemapIndex = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  '<sitemap><loc>https://openfray.app/sitemap-0.xml</loc></sitemap>',
  '<sitemap><loc>https://openfray.app/docs/sitemap-0.xml</loc></sitemap>',
  '</sitemapindex>',
  '',
].join('\n')
writeFileSync('dist/sitemap-index.xml', sitemapIndex)

console.log(
  'Assembled dist/: landing at /, app at /console/, docs at /docs/, _redirects + sitemap-index written.',
)
