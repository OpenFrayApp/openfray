# Product Marketing Context

**Document version:** v1
**Last updated:** 2026-08-14

The canonical marketing context for every OpenFray repo. How things are said is the
style guides' job (the shared core's words table, and the site repo's persuading
voice); this document holds what we say: who OpenFray is for, what it argues, and
what counts as proof.

## Product Overview

**One-liner:** A free, open-source combat console for Game Masters running D&D 5e.

**What it does:** OpenFray tracks what's happening in a fight — initiative,
monster resources, conditions, concentration, group saving throws, and dice — in a
browser tab. It runs fully anonymous with nothing installed; signing in (free, with
Discord or Google) saves fights, custom creatures, characters, and campaigns across
devices.

**Product category:** combat tracker / initiative tracker (the shelf GMs search);
"combat console" is the product's own label and leads in titles and prominent copy.

**Product type:** free web app, open source (AGPL-3.0), a project by Nicola
Mustone; no company behind it.

**Business model:** the console is free and ad-free, with no paid tier, and stays
that way; so does everything OpenFray publishes as a free library. Donations
welcome eventually (link TBD). Scope every claim to the console or to the
published material by name — "OpenFray is free" is the shape to avoid, because it
speaks for the whole project rather than for the product it describes.

## Target Audience

**Who:** Game Masters running DnD 5e (5.5e/2024-first, with 5.0 support), at a live
table or hybrid. B2C; the GM is user and decision-maker in one.

**Two segments** (the site's zones map to them):

- **The paper-and-pencil GM** — runs fights on a notepad or behind the screen;
  skeptical of apps at the table. Wants relief, not software.
- **The tool-switcher GM** — has a tracker or VTT open already, with a specific
  frustration: it tracks each creature and forgets the relationships, or it wants
  the whole character ecosystem before it helps.

**Primary use case:** running the combat half of a session without losing hold of
the fight's state.

**Jobs to be done:**

- Hold the fight's state so the GM doesn't have to: who's up, what's ticking, what
  ends when.
- Resolve the crunchy moments fast: one Fireball, six saves, defenses applied, one
  click.
- Keep the table in the fight: a read-only player view on their own phones, showing
  only what the GM allows.

**Use cases:** the in-person table (laptop or tablet beside the screen); the
mixed-tool table (a paper-drawn map, players rolling on D&D Beyond, the GM running
the fight on OpenFray — the maintainer's own table); a pickup one-shot with zero
prep; campaign play with a persistent roster, custom creatures, and house rules;
the hybrid table where remote players follow the player view.

## Problems & Pain Points

**Core problem:** mid-fight state overload. The tools that came before track each
creature well and forget the relationships: that Reckless Attack grants advantage
against the barbarian, that Vicious Mockery debuffs the goblin's next swing, that
six creatures all need the same save, that the concentration check is due the
moment damage lands.

**Why alternatives fall short:**

- Trackers model creatures, not the relational state between them.
- VTTs are map-first and prep-heavy; overkill for theater-of-the-mind.
- Character-ecosystem tools want the whole party imported before they help.
- Paper forgets, and shares nothing with the table.

**What it costs them:** slow rounds, missed effects and rules, broken table
momentum, and rulings re-litigated because nobody wrote down who had what.

**Emotional tension:** the fear of dropping the ball mid-combat in front of the
table; decision fatigue three hours into a session.

## Competitive Landscape

**Direct** (initiative/combat trackers): track initiative and hit points per
creature; the relational state (two-ended effects, save-ends timing, concentration)
stays in the GM's head. Several gate saving or sharing behind accounts.

**Secondary** (VTTs: Roll20, Foundry, and kin): solve combat as a side effect of
solving maps; the cost is prep and ceremony an in-person table doesn't want.

**Indirect** (paper, the GM screen, a spreadsheet): free, familiar, infinitely
flexible, and forgets everything; nothing is shared with players.

## Differentiation

**Key differentiators:**

- **Relationships are first-class.** Effects have two ends; OpenFray records which
  end is which and works it into the roll, whichever side is rolling.
- **A scratchpad, not a system of record.** It never asks for a player's build,
  which is why it stays fast instead of becoming a worse VTT. The scope principle
  is a selling point.
- **Anonymous and instant.** A browser tab, nothing installed, no account for the
  first fight. The fight lives in the tab and saving happens in the background, so
  the board answers immediately; nothing the GM does waits on the network.
- **The player view.** A shareable read-only screen with GM-controlled reveal,
  stored nowhere.
- **Honest dice.** CSPRNG with bias rejection and a transparent roll log; no
  feels-fair tampering, ever.
- **Content included.** Basic Rules 2024 and 2014, four Kobold Press libraries,
  and three original books published free — over 2000 creatures, plus a full
  homebrew editor and a D&D Beyond importer extension.
- **The console is open source (AGPL)**, ad-free, and free.

**Why customers choose us:** the fight runs itself forward; the GM keeps the
judgment and loses the bookkeeping.

## Objections

| Objection | Response |
|-----------|----------|
| "Another app at the table." | It's a browser tab. Nothing installs, no account for the first fight, and it's built for a table with real dice and real books still on it. |
| "I already have a VTT." | Keep it for the map. OpenFray does not do maps and will not; run the battlefield wherever you like and leave the fight to us. |
| "Will it stick around? Where's my data?" | Open source under AGPL; anonymous mode stores nothing anywhere; signed-in data sits in your account and the code to run your own is public. |
| "Really free?" | The console is free and ad-free, with no tier, and stays that way. Donations optional, someday. |

**Anti-personas:** tables that want one integrated platform where the character
sheets drive the combat automation; players looking for a character sheet manager
(out of scope by design); GMs who want the app to adjudicate for them: OpenFray
automates the bookkeeping it is told about (advantage worked into rolls, durations
ticking, the concentration prompt when damage lands) and always accepts a typed
result instead, but it never rules on what a character can do.

## Switching Dynamics

**Push:** fumbled effects and slow rounds; a tracker that models too little or
demands too much; prep that eats the evening.

**Pull:** a board that's ready in a minute, reminders that fire on the right turn,
one-click group saves, the player view, three free books.

**Habit:** the paper ritual works "well enough"; VTT subscriptions and imported
content; muscle memory mid-campaign.

**Anxiety:** a screen and a battery at a candle-and-dice table; learning a tool
mid-campaign; a solo open-source project's longevity.

## Customer Language

**GAP — no verbatim customer quotes collected yet.** There is no interview,
review, or community-thread corpus. When words arrive from real GMs, they land
here first.

**Words to use / avoid:** the shared style core's words table governs (Game
Master never DM; fight and encounter interchangeably; creature; the console;
"combat tracker" and "initiative
tracker" as search synonyms in metadata and descriptions; 5.5e named before 5e;
"DnD", never "D&D" as our own term).

**Glossary:**

| Term | Meaning |
|------|---------|
| the console | the whole app |
| the tracker | the initiative list inside it |
| the compendium | the built-in content libraries |
| effect | one tracked consequence: condition, advantage, modifier, or reminder |
| quick add | a name/HP/AC throwaway combatant |
| player view | the read-only shared screen |
| library | one content collection (Basic Rules 2024, Tome of Beasts, a book of ours) |

## Brand Voice

Owned by the style guides, not this file: the site repo's STYLE.md (the persuading
voice: plain, concrete, contrast at decision points only, claims the app delivers
today) on top of the shared core. Personality in five words: plain-spoken, precise,
honest, unhurried, GM-first.

## Proof Points

- Shipped and stable: 1.0, running tables at openfray.app/console.
- Over 2000 creatures included across six third-party libraries.
- Three original books written and published in full, free: The Waking Garden,
  Brood & Bloom, On Strong Waters and Potent Simples.
- Runs with no account and nothing installed; open source under AGPL.
- **Metrics exist:** Fathom Analytics runs on the site and the console — aggregate
  visits plus named product events (Combat started, Spell cast, Group save rolled,
  and kin), with no personal data in any of them. Pull current numbers from the
  Fathom dashboard when a piece needs proof.
- **GAP:** no testimonials or customer quotes yet.

## Goals

**Business goal:** adoption — GMs running real fights with it, returning weekly.
Not revenue.

**Conversion ladder:** (1) open the console and run a fight; (2) create the free
account that makes them a returning GM. Sell the first hard, seed the second,
never gate the first behind the second.

**Current metrics:** Fathom (aggregate + events) is live on both surfaces; no
targets or baselines are recorded in this document yet.

## Changelog

*Newest first. One line per revision: what changed and why.*

- v1 (2026-08-14) — Initial context, drafted from the codebase and the style-review
  grilling (site job, conversion ladder, segments all decided there). Gaps flagged:
  customer verbatims, metrics, testimonials.
