// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

// Assembles dist/ for Cloudflare Pages. Vite builds the app into
// console/dist/console (base = /console/), Astro builds the marketing site into
// site/dist, and Starlight builds the handbook into docs/dist (base = /docs/). This
// step copies each into the dist root and writes the Pages routing rules. Output
// dir for Pages is dist/.
import { copyFileSync, cpSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'

// Site root (/) → the Astro-built marketing site (home, privacy, terms, 404).
cpSync('site/dist', 'dist', { recursive: true })

// /console → the Vite-built app. The console workspace builds into its own
// dist/console so the base path survives; copy it under the same path here.
cpSync('console/dist/console', 'dist/console', { recursive: true })

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
cpSync('docs/dist', 'dist/docs', { recursive: true })

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
// and give the app an SPA-style fallback so any /console/* path resolves to the app
// shell (real static assets under /console/ are served first, so this only catches
// unknown paths). The docs are fully static, so they need no fallback. The site root
// is left to dist/index.html.
const redirects = [
  '/console            /console/             301',
  '/console/*          /console/index.html   200',
  // The two surfaces a Game Master hands to someone else: /p/<code> is the table's
  // read-only player board, /s/<code> is a published encounter. They sit at the domain
  // root rather than under /console because they are pasted into a chat window, and the
  // app reads the code off the path either way.
  '/s/*                /console/index.html   200',
  '/p/*                /console/index.html   200',
  '/docs               /docs/                301',
  ...Object.entries(docsMoves).map(([from, to]) => `${from.padEnd(38)}${to}  301`),
  '',
].join('\n')
writeFileSync('dist/_redirects', redirects)

// The app shell again as the console's own 404 page. Pages looks for the closest
// `404.html` from the requested path upward, so this is what actually answers a deep
// link like /console/play/<code>: the shell loads and `main.tsx` reads the path. The
// `_redirects` proxy above is the rule that ought to do it — it has been in the file
// since launch and has never fired on a splat, while every 301 beside it works — so
// the fallback is what the feature relies on. It has to be inside dist/console: at the
// root it would swallow every unknown path on the marketing site too.
copyFileSync('dist/console/index.html', 'dist/console/404.html')

// And the same shell under each shared root, which is what actually answers /s/<code>
// and /p/<code>. Each one is scoped to its own directory, which is what makes it safe: a
// root-level 404.html would swallow every unknown path on the marketing site, including
// the ones the site's own 404 page is for.
//
// The shell it copies describes the console, because that is the page it usually is. On
// these two it is not, and the tags are what a chat window reads when somebody pastes the
// link: without this, every shared encounter unfurls as "Combat console" pointing at
// /console/, which is neither the page nor its address. So each copy gets its own.
//
// The description says nothing about the encounter behind the code. The tags are the same
// for every link under a prefix, because a link scanner that follows one into a chat log
// should learn no more than the person who was sent it chose to say.
const SHARED_SHELLS = {
  s: {
    title: 'A shared encounter — OpenFray',
    description:
      'Someone shared a Dungeons and Dragons 5e encounter with you. Open it to read the ' +
      'creatures, or add it to your own board.',
  },
  p: {
    title: 'Player view — OpenFray',
    description:
      'A live, read-only view of the fight your Game Master is running. It shows what they ' +
      'choose to show.',
  },
}

/** The shell again, saying which of the two surfaces it is rather than which app it is. */
function sharedShell(html, root, { title, description }) {
  const url = `https://openfray.app/${root}/`
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
    .replace(
      /(<meta\s+(?:name|property)="(?:description|og:title|og:description|og:url|twitter:title|twitter:description)"[^>]*content=")[^"]*(")/g,
      (whole, open, close) => {
        if (whole.includes('og:url')) return `${open}${url}${close}`
        if (whole.includes('title')) return `${open}${title}${close}`
        return `${open}${description}${close}`
      },
    )
}

const shell = readFileSync('dist/console/index.html', 'utf8')
for (const [root, meta] of Object.entries(SHARED_SHELLS)) {
  mkdirSync(`dist/${root}`, { recursive: true })
  writeFileSync(`dist/${root}/404.html`, sharedShell(shell, root, meta))
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
