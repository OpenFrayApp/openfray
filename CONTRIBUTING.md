# Contributing to OpenFray

Thanks for wanting to help. OpenFray is a community project, and contributions are
genuinely welcome: code, bug reports, ideas, docs.

Before anything else, please read the one rule that matters most.

## The scope rule (read this first)

**OpenFray is a fast scratchpad for combat, not a system of record.**
It tracks what happens at the table, plus the reference a GM jots (a player
character's stats, defenses, and character notes). It never models the _rules engine_ behind a
character.

Every contribution is measured against one question:

> **Does it require knowing a player character's build? If yes, it's out of scope.**

This keeps the app fast, simple, and maintainable by a small community. It is not
a temporary limitation. It is the core design. Things that are **out of scope**
because they cross this line:

- Knowing a PC's class, level, subclass, or feature list
- Tracking PC spell slots, resources, or abilities (that's their sheet / D&D Beyond)
- Auto-applying what a class feature _does_ (we model the _result_ it leaves on the
  board, not the feature)
- Anything that turns OpenFray into a character manager or a VTT

If a feature you want seems to need any of the above, open an issue to discuss
_before_ building. There's almost always a scratchpad-shaped version of the idea
that fits (model the consequence, not the cause). We'd rather talk it through than
have you build something we can't merge.

### The other load-bearing principles

These come from the same spirit; please keep them intact:

- **Effects model results, not causes.** Conditions, advantage, disadvantage, flat
  modifiers, reminders, save-ends. Those ~6 shapes cover all of 5e. Don't add
  per-class-feature logic; add to the general Effect system if needed.
- **Local-first.** The UI mutates in-memory state and feels instant; persistence is
  a background effect, never a gatekeeper the UI reads through. Don't put a network
  round-trip in front of a dice roll or a condition toggle.
- **Snapshot, don't reference.** Creatures entering combat are copied; editing a
  library template must never mutate a fight in progress.
- **Dice are honestly random.** CSPRNG + modulo-bias rejection. Never add
  "anti-streak" or "feels-fair" tampering. Uniform and transparent, always.
- **Don't become a character sheet.** (Yes, it's worth saying twice.)

## Getting the project running

You need the Node version in [`.nvmrc`](./.nvmrc) (`nvm use`) and npm. Each part is
its own repo and runs on its own: clone it, `npm install`, `npm run dev` (the site
wants a `console` clone beside it; see each README). To build the assembled site,
clone this repo with submodules; one install here covers all three workspaces:

```bash
git clone --recurse-submodules https://github.com/OpenFrayApp/openfray.git
cd openfray
npm install
```

The three parts ship as one site. Each has its own dev server; most work needs
only one:

| Command                   | What it starts             | URL                     |
| ------------------------- | -------------------------- | ----------------------- |
| `npm run dev -w console`  | the console (Vite)         | localhost:5199/console/ |
| `npm run dev -w site`     | the marketing site (Astro) | localhost:4321          |
| `npm run dev -w handbook` | the handbook (Starlight)   | localhost:4322/docs/    |

A change to a part is committed in that part's repo, on a branch, and PRed there;
a change to the deploy scripts or the shared docs is PRed here.

Before opening a PR, make sure the checks you touched pass:

```bash
npm run typecheck
npm run lint
npm run format
npm run test
npm run build
```

`npm run build` builds all three parts and assembles `dist/` — it's the only check
that proves the links _between_ the parts resolve.

## How to contribute

1. **Open an issue first** for anything beyond a small fix, especially features, so
   we can sanity-check scope together before you spend time.
2. **Fork, branch, build.** Branch names like `feat/mass-save` or `fix/turn-order`.
3. **Keep PRs focused.** One concern per PR; easier to review, faster to merge.
4. **Follow [`AGENTS.md`](./AGENTS.md)** — it is the source of truth for how we
   build here: the architectural rules, the code style (self-explaining code, a
   one-line header comment on every named function, no other comments unless the
   code can't say it), and where tests live. Styling is Tailwind in both the app
   and the marketing site, but the two use opposite light/dark conventions and the
   site has a few rules worth reading first. See "How the site is styled" there
   before touching CSS.
5. **Bring tests.** Everything testable ships with tests, in `console/tests/`
   (mirroring `console/src/`) or `site/tests/` for the site. See "Tests" in
   `AGENTS.md`. A behavior change updates its tests in the same commit.
6. **Follow the style guide for any words a user will read.** [`STYLE.md`](./STYLE.md)
   covers the handbook, the marketing site, and the app's own labels and messages.
7. **Sign your commits (DCO).** Use `git commit -s`, which adds a `Signed-off-by:`
   line certifying you have the right to submit the code under the project's
   license.

## Reporting bugs

Open an issue with: what you did, what you expected, what happened, and your
device/browser. A screenshot of the combat state helps a lot for tracker bugs.

## Suggesting features

Open an issue describing the _table problem_ you're trying to solve, not just the
solution. "I keep forgetting X mid-combat" tells us more than "add a button for X,"
and it helps us find the scratchpad-shaped version that fits.

## Licensing of contributions

OpenFray is licensed under **AGPL-3.0**. By contributing, you agree your
contributions are licensed under the same terms. The DCO sign-off (`-s`) on your
commits is how you certify this.

## Questions

Open an issue or a discussion. Be kind and assume good faith. See the
[Code of Conduct](./CODE_OF_CONDUCT.md).
