# Changelog

Release notes for the console, website, and handbook live here, newest first.
Versions through 1.2.0 record the console’s release history.

## 1.3.0 (2026-09-24)

### Added

- Offline recovery and security hardening, including safe updates, cloud-copy conflict handling, session recovery, and reliable shared player views. ([console#38](https://github.com/OpenFrayApp/console/issues/38))
- Search creatures, spells, conditions, saved characters, and console navigation from the header, with scrollable results and a configurable keyboard shortcut. ([console#41](https://github.com/OpenFrayApp/console/issues/41))
  Search uses an icon-only button on phones and tablets.
- Choose numeric, Roman numeral, or letter labels for repeated creatures; labels stay stable after removals. ([console#75](https://github.com/OpenFrayApp/console/issues/75))
- Choose creature and ally marker colors, with independent reset arrows beside each picker. ([console#77](https://github.com/OpenFrayApp/console/issues/77))
- Player-view marker colors follow the GM’s tracker by default, with separate overrides controlled by the GM. ([console#77](https://github.com/OpenFrayApp/console/issues/77))

### Changed

- Sign in with Google or Discord directly, with the Terms notice beside the provider buttons and no checkbox.
- The tracker uses updated cleanup icons, and the game log heading separates it from the controls.
- Keyboard focus is visible, initiative rows support arrow-key reordering, and repeated touch controls have larger targets. ([console#42](https://github.com/OpenFrayApp/console/issues/42))

### Fixed

- Reference search includes all enabled creature libraries and available spells; the GM can cast a searched spell in an empty encounter. ([console#41](https://github.com/OpenFrayApp/console/issues/41))

## 1.2.0 (2026-08-24)

Keep a fight to come back to, and hand one to somebody else.

### Saved encounters

- A fight can be **saved** from the top bar and picked up in a later session: the board
  as it stood, with the party, hit points, effects, initiative, the round and the log.
  Save as many as you like, and as often as you like.
- Saved fights live in the compendium, under **Encounters**. A card shows what was on the
  board, grouped and counted, so you can tell one goblin ambush from another without
  opening either.
- Two ways back in. **Restore** brings the whole encounter back, party and hit points
  included. **Add creatures** drops only its creatures onto the board you have now, at
  full hit points.
- Saving needs an account, because a fight kept in this browser would not be there on the
  laptop you run next week's session from.

### Publishing

- An encounter, or a single creature, can be **published** to a link anyone can open.
  They read it in the browser and add it to their own board with one click. Publishing
  needs an account.
- What travels is the cast, a name, a note you write, a byline, and a license. What does
  not: your player characters, hit points, effects, initiative, or the log. A published
  encounter is prep, not a fight.
- **Two licenses, and they are separate.** The encounter's covers your own words: its
  name, your note, and which creatures you put together. Each creature carries whatever
  its author gave it. A creature nobody licensed for reuse can be read on the page and is
  left behind when somebody adds it, and the app says which ones and why first.
- A creature can say **where it came from** and **how it may be reused**, and the stat
  block shows both.
- Your account holds a **default byline** and a **default license** that the publish
  dialog starts on.
- **Shared links** is a screen of its own, under your account: everything you have up,
  with a copy, an open and an unpublish beside each. Nothing expires on its own, and
  unpublishing is immediate and final. The moment right after publishing offers the same
  three buttons; taking a link down there drops the dialog back to its form, saying that
  publishing again makes a new link.
- A creature brought in with the OpenFray Importer cannot be published. Those stat blocks
  are Wizards of the Coast's.
- Up to 200 published pages per account. Unpublishing makes room.

### Reading somebody else's link

- A shared link opens its own page, without loading the console: the cast, the note, the
  byline, and every creature's stat block.
- **Report this** is on every published page. Anyone can use it, nobody is asked who they
  are, and a reply address is optional. A page that breaks the terms is removed and its
  author is told.
- A page that was taken down says so, rather than reading the same as a code somebody
  mistyped.
- A stranger's stat block is held to what the console can actually run, and a stranger's
  note renders bold, italic, quotes, lists and headings and nothing that navigates or
  fetches.

### Casting to the table

- The share control wears a **cast icon** now, because that is what it does — the
  monitor read as a setting, not an action.
- A shared link can be **locked behind a four-digit PIN**: the popover sets it, and a
  viewer types the same four before the board shows. A wrong PIN gets silence, not an
  error that gives anything away.
- A campaign can set a **backdrop** for the table's screen, picked from a bundled set —
  a mountain fortress, a desert ruin, an elven city, a frozen lake, a morning harbor, a
  valley road, a magical forest, and more. Each is treated for light or dark and shows
  at full strength; the theme toggle stands down while one is up, since the art has
  already chosen.
- The table's screen can head itself with the **campaign's name and the Game Master's**,
  each gated by its own setting under Player view, off by default and shared only for a
  signed-in GM.
- The link and its name are **one field** now, not two: the part nobody edits reads as
  text, the code sits after it, and Save appears only once you've actually typed a name.
- Signing out **hands the link back to an anonymous one**, so a device that no longer
  owns your name stops broadcasting under it.

### The dice bar

- The bar rolls a **d100** now, alongside the rest.
- A **roll mode** — Regular, Adv, Dis — sits beside the dice as one control and applies
  to whichever die you press next, on any die, not just the d20. A d20 rolled at
  advantage logs as advantage, not as a keep rule spelled out.

### Smaller things

- The player view moved to `openfray.app/p/`, beside published encounters at
  `openfray.app/s/`. Both sit at the domain root, because they are pasted where somebody
  who has never seen the console will read them.
- Neither is counted by its code. Analytics sees `/s/` and `/p/` and nothing after them.
- The compendium's tabs lay out three by three.
- The app says **encounter** where it used to say fight.
- A link in your own prose opens in its own tab, so following one does not navigate away
  from the fight you are running.
- **Rests, Group save and Cast spell** hold their place in the header on an empty board
  instead of vanishing, and grey out like everything else that needs a creature there.
- **Save** greys out on an empty board too, the same way sharing already did, instead of
  opening a popover just to say no.
- The line above **Publish** now opens with the confirmation itself — you hold the
  rights, you agree to the terms — rather than a description of what publishing means.
- A condition named in a spell's rules text, or in the **Applied effects** list, explains
  itself on hover, the way one in the tracker already does.
- A field's description sits behind a **hover hint** — the ? beside its label — so what's
  left visible is state or consequence, not boilerplate.
- The short-rest tally sits in the **campfire button's corner**, off the artwork.

## 1.1.0 (2026-08-17)

The console runs on a phone, answers to the keyboard, and knows when an effect ends.

### On a phone and a tablet

- The console is three screens you swipe between on a phone — the tracker, the stat
  block, and the controls — with a bottom bar to jump straight to one. Tapping a
  creature in the tracker slides over to its stat block.
- Every control has a finger-sized target on a touch screen, and a mouse keeps the
  dense layout it had. Form fields lift to a size iOS Safari won't zoom the page for.
- A tablet held portrait gets the phone's layout whole, iPad Pro included. Held
  landscape, a small tablet puts the tracker beside the stat block with the controls and
  the log below; from a laptop's width up, the three-column console is unchanged.
- The header's panels open as sheets on a phone, and a button stays where it is while
  its panel is open. The three add buttons collapse into one.

### The keyboard

- The console can be run from the keyboard: turns and the fight, the selection, the
  selected creature's damage, effects, concentration and reaction, every add and open,
  the compendium, the dice bar, and the log.
- Every shortcut is rebindable in Settings, and the full list is a keystroke away.

### Effects

- An effect can be hung on a **turn**: start of turn or end of turn, on any creature on
  the board, not just the one you are applying to. "Charmed until the start of its next
  turn" is now something the box can say, and it clears itself at the right moment.
- **or its next roll** rides on top of any duration, ending the effect early on the
  first roll it changes. It replaces "This turn / next attack", which looked like a turn
  and wasn't, and which never cleared for a player's own rolls. The duration underneath
  is what ends it there. An effect saved with the old option still works, and reads as
  "Until removed" with the box ticked.
- The 1 round chip is gone; end of turn says what it meant, and Custom still counts
  rounds.
- A roll made anywhere in the console now spends what it should. Group saves,
  concentration checks and a creature's own stat-block rolls used to leave a spent
  effect sitting on the row.
- Vicious Mockery, Latchwork, Guiding Bolt, Guidance and Resistance carry the bound the
  rules give them, re-read against both editions — the end of a named creature's turn,
  or the spell's own minute — instead of waiting on a roll that might never come.

### Casting

- A spell resolved by an attack roll applies its effect. **Guiding Bolt** left nothing on
  the target it hit, and Flame Blade, Spiritual Weapon, Arcane Hand, Arcane Sword and
  Vampiric Touch left no reminder on the caster.
- The caster's name is on the modal whether a creature or a character is casting.
- A saved character's **spell attack bonus** and **spell save DC** are filled in from the
  class, level and ability scores you transcribed. A class that casts through a subclass,
  a multiclass caster, and an anonymous character all leave the field to you, as before.

### Campaigns

- A campaign carries **notes** — markdown, private to you, for the threads and hooks that
  aren't house rules. They sit in the campaign form and on the campaign card, where you
  can write them without opening the form: click, type, click away. The same notes a
  character has had, on the game itself.

### Smaller things

- A condition chip in a resolver reads as a state: lit when the target has it, and
  tapping a lit one clears it instead of stacking a second copy.
- A picker says what it just added.
- The compendium follows the same layout switch as the fight.

## 1.0.0 (2026-08-07)

Out of beta. The [beta](https://openfray.app/news/openfray-beta-release/) named one thing as still to come,
a read-only player view. This is it, along with a rebuilt effects flow and two more
libraries to run from.

### The player view

- A second screen your table can look at, on their own devices, at a link you share.
  It shows the turn order and the game log, and nothing you haven't given it.
- You choose what reaches it. Hide a creature from the table or reveal it early, keep
  its conditions to yourself, and let a creature fight for the party.
- Actions reach the shared log without their arithmetic: what a creature did and what
  its roll came to, not the dice behind it. Saves settle before they are shared.
- The fight's clocks, the damage dealt each way, and the end-of-fight summary go to the
  table too. The log starts fresh with each fight, and creatures stay off the view until
  the fight begins.
- Sharing survives a reload and ends when you close the tab. Links can be named.

### Effects

- An effect can now carry several parts (conditions, modifiers, reminders and counters),
  applied together as one named bundle, from a rebuilt **Apply effect** box.
- Modifiers can be scoped to particular abilities, so a roll that doesn't know its
  ability never picks one up. Bless and Bane are scoped to attacks and saves.
- An effect can be marked for the Game Master alone, so a count you keep stays off the
  table's screen.
- Effects reach a saved character's derived numbers: armor class, initiative, hit point
  maximum and Speed, which a modifier can halve, double, or drop to 0.
- Casting a spell lands all of its effects as one bundle named for the spell. Every
  spell in the table was re-read against the rules text of both editions.
- Exhaustion has a level, and lands from an attack or a saving throw.
- Save an effect you use often as a preset. The brood diseases ship as presets.

### Dice

- Rolling moved to [opendice](https://github.com/SirDarcanos/opendice), which rolls each
  die through a cryptographic generator and reports every die it rolled.
- An advantage roll shows both dice, a damage roll shows the dice behind its total, and
  every roll carries to its total with an arrow. A natural 1 is named a critical miss.
- Reroll anywhere the console rolls.
- A group saving throw applies each creature's defenses by damage type, and says what it
  rolled for whom.
- Recharge and escape rolls are the Game Master's alone.

### Libraries

- **Creature Codex** joins the opt-in libraries, with its own source line and its full
  attribution chain.
- **On Strong Waters and Potent Simples** is a new library, and the first with no
  creatures in it. It adds 11 castable spells and three effect presets: Intoxication,
  Craving, Addiction.
- **Brood & Bloom** gained its spells as a castable library, and the Hands of the Host.

## 0.2.0 (2026-07-31)

Out of alpha. [The post](https://openfray.app/news/openfray-beta-release/).

- Four more libraries: the 2014 rules, the three Tome of Beasts books, and two OpenFray
  writes itself, _The Waking Garden_ and _Brood & Bloom_.
- The 2024 creatures and spells are read from the official rules document rather than a
  third-party feed, fixing a long tail of wrong sizes, missing alignments and mangled
  casting times.
- The fight is rated before it starts and summarized after it ends: experience earned and
  what it works out to per player, rounds, real and in-game time, damage each way.
- The roll log became a game log. It records turns and rounds, conditions applied and
  cleared, concentration started and broken, damage, healing, knockouts and rests, kept
  for the whole fight, grouped by round, and filterable.
- Clocks while you fight, in real time with pauses excluded and in game time at 6
  seconds a round.
- Paste a creature as JSON, or take one from a stat block with the OpenFray Importer
  browser add-on.
- Conditions explain themselves wherever they appear, and counters tally what nothing
  counts for you.

## 0.1.0 (2026-06-23)

The first public build. [The post](https://openfray.app/news/openfray-is-in-alpha/).

The console ran a fight end to end in a browser tab, with no account and nothing
installed: initiative, timed effects that count themselves down, creature resources and
recharges, concentration, group saving throws, and dice with a log that shows its
working. It shipped with the 2024 rules, a stat-block editor for creatures and a card
editor for spells, a character roster, and campaigns carrying a table's house rules.
