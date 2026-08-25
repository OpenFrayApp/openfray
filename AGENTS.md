Guidance for AI agents (and humans) working across the OpenFray repos. This file is
the source of truth for the **cross-repo agreements**: code style, writing style,
committing, and content licensing. Each part's own AGENTS.md carries its domain
(the console's scope principle and architecture, the site's books and styling, the
docs repo's screenshot pipeline). The full reasoning lives in the maintainer's
working notes (`local/docs/`), which are **not committed**.

Its counterpart for words is [`STYLE.md`](./STYLE.md), the shared core of the
writing style: the words table, the grammar, and the game-text mechanics. Each
part's repo carries its own voice guide beside its code. **Read the core plus the
local guide before writing or changing any user-facing copy.**

In here:

- [The one principle](#the-one-principle) — the scope test every repo answers to
- [Repo layout](#repo-layout) — the repos, the submodules, how a release ships
- [Code style](#code-style) · [Writing style](#writing-style-documentation)
- [Tests](#tests) · [Committing](#committing) · [Working agreements](#working-agreements)
- [Licensing of content](#licensing-of-content)

---

## What OpenFray is

A fast, browser-based **combat console** for Game Masters running DnD 5e
(5.5e/2024-first, with 5.0 support). It tracks what's happening in a fight:
initiative order, monster resources, conditions, and the relational state between
combatants, plus dice and an SRD reference.

## The one principle

> **OpenFray is a fast scratchpad, not a system of record.**
> We track what happens at the table, plus the reference a GM jots. We never model
> the _rules engine_ behind a character.

The test for any feature: **does it require knowing a player character's build? If
yes, it is out of scope.** The full statement, with the in/out lists and the one
deliberate carve-out, is in the
[console repo's AGENTS.md](https://github.com/OpenFrayApp/console/blob/main/AGENTS.md);
it governs every repo's work, the books and the site copy included.

## Repo layout

Three parts ship as **one site**. Each is its own repo under
[OpenFrayApp](https://github.com/OpenFrayApp), mounted here as a git submodule;
`scripts/assemble-site.mjs` merges their builds into `dist/` for Cloudflare Pages.
This parent repo owns the deploy and the shared docs.

| Folder (submodule)           | Repo                  | What it is                                              | Served at  |
| ---------------------------- | --------------------- | ------------------------------------------------------- | ---------- |
| `console/`                   | `OpenFrayApp/console` | the React + Vite combat console                         | `/console` |
| `site/`                      | `OpenFrayApp/site`    | Astro marketing site, plus the published libraries      | `/`        |
| `docs/`                      | `OpenFrayApp/docs`    | Starlight handbook for players and GMs                  | `/docs`    |
| `console/public/compendium/` | —                     | generated SRD / Tome of Beasts JSON the app fetches     | —          |
| `functions/`                 | —                     | Pages Functions: the card a shared link unfurls with    | `/s/*`     |
| `share-card/`                | —                     | what a share says about itself, read by those Functions | —          |
| `local/`                     | —                     | maintainer working notes, **not committed**             | —          |

Day to day, each part is worked on as its own standalone clone (the site needs a
`console` clone beside it). Clone this repo with `git clone --recurse-submodules` to
build or release the whole. A change to a part is committed in that part's repo;
this repo then records the new submodule pointer, and that pointer-bump commit is
what deploys (`npm run release` does the whole dance).

Each part documents itself: the console's AGENTS.md holds the scope principle in
full, the architectural rules, and the build order; the site's holds the book
sources, the print edition, and the styling rules; the docs repo's holds the
screenshot pipeline. `STYLE.md` here governs the copy in all of them.

### Pages Functions

`functions/` holds the only server-side code in the project: `s/[code].ts` swaps per-share
meta tags into the shared shell, and `s/[code]/og.png.ts` draws the picture behind them.
Four things about them.

- **They live at the project root and are compiled separately from `dist/`.**
  `assemble-site.mjs` must never copy them.
- **They read the project's Supabase URL and anon key**, under either the plain or the
  `VITE_`-prefixed name. Pages hands a Function every variable the project declares; the
  prefix is only Vite's instruction about what to bake into the client bundle. When every
  card falls back to the site banner, check the variables first: a Function reading
  `undefined` degrades silently, on purpose.
- **`wrangler pages dev dist` is the only place a routing bug shows up.** A 200 rewrite
  Pages has rejected is reported nowhere else. Run it after any change to `_redirects` or
  to a Function, and read the output for "Infinite loop detected in this rule".
- **Their tests are this repo's**, in `tests/share-card/`, beside the deploy-script tests.
  Set `.dev.vars` at the root for a local run; it is gitignored.

### Workspaces & dev servers

`console/`, `site/`, and `docs/` are **npm workspaces** of this repo: one
`npm install` here covers all three, and each still declares its own dependencies in
its own `package.json`. There is one lockfile, at this root.

Each part runs its own dev server, on a port pinned in its own config, not passed on
the command line, so the npm scripts and the editor's launch configs agree
(`npm run dev` at this root is an alias for the console's):

| Command                  | What it starts             | URL                     |
| ------------------------ | -------------------------- | ----------------------- |
| `npm run dev -w console` | the console (Vite)         | localhost:5199/console/ |
| `npm run dev -w site`    | the marketing site (Astro) | localhost:4321          |
| `npm run dev -w docs`    | the handbook (Starlight)   | localhost:4322/docs/    |
| `npm run dev:all`        | all three at once          | the three URLs above    |

Most work needs only one of them. `npm run build` builds all three and assembles
`dist/` — the only check that proves the **links between** the parts resolve, since in
dev they're on different origins.

> **Don't try to serve all three from one dev origin.** Proxying `/console` and `/docs`
> through the site's dev server does not work. Each Vite dev server emits root-relative
> asset URLs (`/node_modules/…`, `/@vite/client`) with no path prefix, so the proxied
> server's assets get requested from the proxying server, which fails with a confusing
> overlay. Setting `vite.base` fixes the assets and breaks routing instead.

Two companion projects stand apart from the site entirely, because they have their own
release cadence and consumers: [compendium](https://github.com/OpenFrayApp/compendium)
(the ingest tooling that generates `console/public/compendium/*.json`) and
[importer](https://github.com/OpenFrayApp/importer) (the browser
extension). They are not submodules here; nothing in the deploy reads them.

Two more are npm packages, general enough that nothing about them is OpenFray's:
[opendice](https://github.com/SirDarcanos/opendice) rolls the dice, and
[shotlist](https://github.com/SirDarcanos/shotlist) takes the screenshots. The
screenshot pipeline itself (recipes, config, annotation scripts) lives in the docs
repo, documented in its AGENTS.md.

## Code style

The aim is code that explains itself: names carry the meaning, comments carry only
what a name can't.

- **Every named function, method, component, and hook opens with a one-line header
  comment saying what it does.** In TypeScript and JavaScript that's a one-line
  JSDoc (`/** Apply a defense relation to a damage amount. */`) so editors surface
  it on hover; in an Astro frontmatter block the same. Inline callbacks and lambdas
  passed as arguments stay bare.
- **No other comments unless the code can't say it.** A non-obvious _why_, a gotcha,
  a workaround, or a 5e-rules citation earns a comment; narration of what the next
  line does, restating a well-named symbol, banner/section dividers, and
  self-congratulation do not. Keep comments factual and current. Delete stale ones
  rather than let them mislead.
- **One definition per concept.** A helper needed by two files moves to a shared
  module; never paste a second copy. Canonical homes: combatant accessors in
  `console/src/combat/combatant.ts`, display formatting in
  `console/src/compendium/format.ts`, schema-level derivations in
  `console/src/schema/`, the site's formatting in
  `site/src/data/wakingGarden.ts`. (The app formats a negative as `-1`; the site's
  game content uses the true minus `−1` per `STYLE.md` — that's why the two sides
  keep separate formatters.)
- **Match the file you're in** — naming, idiom, and comment density. New source
  files start with the short AGPL header (`SPDX-License-Identifier` + copyright).
- **Prettier and ESLint decide formatting** — run `npm run format` before
  committing; never hand-align or fight the formatter. Each repo formats itself;
  this repo's formatter covers only its own files.
- **All user-facing copy follows the style guides**: the shared core in
  [`STYLE.md`](./STYLE.md) here, and the voice guide in the surface's own repo.

## Writing style (documentation)

Every Markdown file in every OpenFray repo is technical documentation written for a
developer or a user who needs to get something done. That includes each repo's
`AGENTS.md` and `README.md`, `CONTRIBUTING.md` and `STYLE.md` here, the console
repo's `CHANGELOG.md`, the handbook in the docs repo, the news posts in the site
repo, and the skill files in the site repo's `.claude/skills/`. Write all of it
plain, short, and direct. Every repo carries the same `scripts/check-prose.mjs`,
scoped to its own files. Nothing in these repos is an essay.

The books and the site's marketing pages are the exceptions: both registers are
governed by the site repo's STYLE.md. Do not borrow either voice anywhere else,
including commit messages and code comments.

Five rules for the documentation registers (the site's marketing copy and the
books follow the site repo's STYLE.md instead). `node scripts/check-prose.mjs` runs
on every build and fails on the first.

- **No em-dash aside.** A spaced em dash in the middle of a sentence is this repo's
  worst habit and it is banned outright. Use a period, a colon, or parentheses. One
  form is allowed: a definition list item such as `- **AC** — armor class.`
- **No rhetorical contrast.** State what is true. Cut "not a X but a Y", "X beats Y",
  and any "rather than" clause that exists to sound clever instead of to inform.
- **End on a fact.** No maxims, no summarizing flourish, no last line that reaches for
  a point. The final sentence of a section carries information like every other one.
- **Do not narrate the project.** A doc says what is true now. What was tried, what was
  abandoned, and what someone learned belong in the commit message or the pull request.
- **One idea per sentence**, about 25 words at most, at a high-school reading level.
  Lead with the instruction and put the reason after it, if the reason is needed at all.

Run `node scripts/check-prose.mjs` before committing a doc change. It also reports the
softer patterns without failing, so the count stays visible.

## Tests

Everything testable ships with tests, and a behavior change updates its tests in
the same commit.

- **Where they live:** the console's suite is `console/tests/`, mirroring
  `console/src/` (never co-located). The site's is `site/tests/`, which also covers
  its build checks. The docs repo's covers its annotation scripts. The deploy
  scripts are covered from `tests/scripts/` in this repo.
- **How they run:** `npm run test` at this root chains every suite; each repo also
  runs its own with `npm test`. Tests default to the fast node environment; a
  component test opts into jsdom with a file docblock
  (`// @vitest-environment jsdom`).
- **What "testable" means:** pure logic always (combat math, formatters,
  parsers, transforms); components render-tested for the states that carry logic;
  network and Supabase access behind mocks. The console's AGENTS.md names the two
  places a change can pass tests and still be wrong, and the spell-coverage gate.

## Committing

- **One concern per commit**, committed as the work lands. Keep them small and frequent, not
  one big drop.
- **A change in a part is committed in that part's repo.** Commits here are submodule
  pointer bumps, deploy scripts, and the shared docs.
- **Subject:** `Area: what changed`, imperative, sentence case after the prefix.
  The areas in use: `App`, `Site`, `Docs`, `Print`, `Style`, `Build`, `Scripts`,
  `Copy`, `Tests`. The body explains _why_, in prose.
- **Sign-off (DCO):** every commit carries `Signed-off-by` — use `git commit -s`.
  There is no CLA.
- **Don't push without the maintainer's go-ahead.** Pushing this repo's `main` is
  what triggers the production build on Cloudflare Pages; a part repo's push changes
  nothing in production until the submodule pointer moves here. Work is committed
  locally as it lands and pushed once, deliberately.

## Working agreements

- **Keep PRs/changes focused** — one concern at a time.
- **Be especially careful and explicit around:** auth, the `owner_id`/RLS boundary,
  anything touching user data, and the dice randomness. A change here that "works"
  in testing can still be wrong (e.g. a data-isolation leak passes functional
  tests). Call out the risk and the reasoning.
- **License:** AGPL-3.0 for every part's code. The running app must expose a
  "Source" link to the repo (AGPL §13). New source files get the short AGPL header.
- **Renaming a label in the app is a documentation change** — update the handbook
  page and its screenshots in the same change.
- **When unsure whether something is in scope, ask or flag it. Don't quietly build it.**

## Licensing of content

**Each source is honored under its own license, preferring CC-BY > ORC > OGL.** WotC
SRD is **CC-BY-4.0** (5.2 CC-BY-only; 5.1 dual-licensed → we elect CC-BY; never OGL for
WotC). CC-BY's obligations: credit WotC with their exact attribution string, link the
license, state that changes were made, don't imply endorsement. Third-party content
(e.g. Kobold Press / Tome of Beasts) is honored under its **actual** license: ORC where
offered, else **OGL 1.0a**, and **never assumed CC-BY**. Using a source under the OGL means
shipping **only its declared Open Game Content** (no Product Identity: art, fiction, PI
names, sidebars), reproducing the **full OGL text + verbatim Section 15 chain**, and
designating our OGC. **Never ingest SRD-excluded WotC IP** (Beholder, Mind Flayer, …).
All of this is satisfied via an in-app About/Credits screen + the console repo's
`CREDITS.md`, which is the public record of compliance. Full ingest instructions:
`local/docs/content-licensing.md` (maintainer-local). This content licensing is
separate from the project's AGPL (which governs the code).
