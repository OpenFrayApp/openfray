# OpenFray writing style guide

The shared foundation for every word OpenFray publishes. The reader is always a Game
Master; the voice depends on the surface, and each surface's repo carries its own
guide:

| Repo         | Guide      | Voice                                                                                 |
| ------------ | ---------- | ------------------------------------------------------------------------------------- |
| `handbook`   | `STYLE.md` | **Teaching.** The handbook explains; it never sells.                                  |
| `site`       | `STYLE.md` | **Persuading.** The site argues a GM into opening the console, and carries the books. |
| `console`    | `STYLE.md` | **Labeling.** Buttons, tooltips, errors, empty states.                                |
| `compendium` | `STYLE.md` | **Data.** Stat-block and spell text: rules, nothing else.                             |

**Write in the register of the repo you are in.** A page of handbook copy in the
site's voice, or site copy in the handbook's, is a bug. This file holds only what
every register shares: the words, the mechanics, and the game-text rules two repos
consume. Read it first, then the guide beside the file you are editing.

---

## What we write, and what we don't

- **Write about the app.** What a button does, what a screen shows, what happens next.
- **Don't teach Dungeons and Dragons.** State a rule only when the reader needs it to understand what
  OpenFray is doing (for example, that a save-ends effect is rolled at the start or end of a
  turn). Never restate rules text, and never reproduce SRD content in the docs or on the site.
- **Don't describe what doesn't exist.** If a feature is planned, either leave it out or mark
  it clearly as coming later.
- **Keep it current.** OpenFray still changes often. A UI change and its copy change belong in
  the same commit. A stale screenshot or a renamed button is a bug, not a cosmetic issue.

---

## Words we use

Capitalization and naming are part of correctness. Get these right.

| Use                                 | Not                                                          |
| ----------------------------------- | ------------------------------------------------------------ |
| Game Master, GM                     | Dungeon Master, DM, DMG                                      |
| creature                            | monster, mob, enemy (as a noun for a stat block)             |
| player, player character            | NPC, PC (in prose; **Add PC** is a button label)             |
| hit points, armor class             | HP, AC (in prose; fine in a screenshot or table header)      |
| the console                         | the app, the tool, the tracker (for the whole thing)         |
| the tracker                         | the initiative list, the left column                         |
| the compendium                      | the library, the database                                    |
| the log                             | the roll log, the feed                                       |
| effect, condition, reminder         | buff, debuff, status                                         |
| fight, encounter (interchangeable)  | combat (in prose; "combat" is fine in **Start combat**)      |
| sign in, signed in, sign out        | log in, login, log out, register                             |
| DnD 5e (house short form)           | dnd (lowercase), a bare "5E" as a label                      |
| Dungeons and Dragons, DnD           | D&D, Dungeons & Dragons (only in "D&D Beyond" or legal text) |
| D&D Beyond                          | DDB, DnD Beyond                                              |
| Basic Rules 2024 / Basic Rules 2014 | 5.5e / 5e (badges use these; prose spells it out)            |
| libraries (the content collections) | rule sets, rulesets, sources                                 |

More:

- **The ampersand marks are Wizards of the Coast's, not ours.** Never write "D&D" or
  "Dungeons & Dragons" as our own term. Spell it "DnD" or "Dungeons and Dragons". The
  ampersand form appears in only two places: the **D&D Beyond** product name (we're naming
  their product), and a copyright or legal statement that has to quote the trademark.
  Nowhere else: not in titles, prose, metadata, or keywords.
- **Name 5.5e before 5e, always.** A compatibility line reads "compatible with 5.5e and
  5e", never the other way round: the app is 2024-first, and the order says so before the
  sentence does. The same goes for any pair: Basic Rules 2024 before Basic Rules 2014, 5.5 before
  5.0. The exception is legal copy, which keeps whatever wording it was written with; see
  the legal-pages rule in the site's guide.
- **Edition names: write the ones readers search.** "DnD 5e" is the house short form,
  but "Dungeons and Dragons 5e", "5th edition", and the year forms ("DnD 2024", "Core
  Rules 2024", "2014 edition") are all correct and welcome, especially in page titles,
  descriptions, and metadata, and in prose wherever they read naturally. These are the words
  people type into a search box; match them. Don't lowercase to "dnd" or drop in a bare
  "5E" as a label.
- **The product is the combat console; "combat tracker" and "initiative tracker" are search
  synonyms.** "Combat console" is what the app and the site call OpenFray, so lead with it in
  titles and prominent copy. "Combat tracker" and "initiative tracker" are the phrases readers
  type into a search box. Use them as synonyms in descriptions, metadata, and page
  introductions, not as the main label. Inside the console's own workings the precise nouns
  still hold: **the tracker** is the initiative list, and **the console** is the whole thing.
- **OpenFray** — one word, capital O and F. Never "Openfray", never "the OpenFray app".
- **American spelling** ("color", "canceled"), per Merriam-Webster. This is a deliberate
  exception to how the existing pages read; new and edited copy uses American spelling.
- **"Armor class"** stays lowercase in prose; the app's own label decides the capitalization
  inside bold UI references. Game content capitalizes its own terms; see
  [Formatting game terms](#formatting-game-terms).
- Don't invent abbreviations. If the reader has to learn a term to read the sentence, spell it
  out (for example, "end of turn", never "EoT").
- **Singular "they" is fine.** Use it for a person whose gender is unknown or irrelevant,
  rather than "he or she". This overrides the game's published guide, on purpose, as does
  **Game Master**: Dungeon Master is Wizards of the Coast's mark, and we don't use their
  marks as our own.
- We are not affiliated with Wizards of the Coast, and we never imply we are. Don't use WotC
  trademarks as our own, and keep any licensing statement to the wording already used in the
  app and the console repo's `CREDITS.md`.

---

## Grammar and mechanics

House style follows the Chicago Manual of Style and Merriam-Webster. The rules that come up most:

- **Sentence case everywhere** — titles, headings, buttons, captions, list items.
- **Never all caps** unless the word or sentence is in all caps in the app's UI.
- **Serial comma.** "attacks, saves, and checks".
- **Numbers.** Spell out zero through nine in ordinary prose ("three buttons", "nine
  comments"). Always use numerals for game and interface values: round 1, 8 hours, DC 15,
  `2d6+3`, +5, 0 hit points, step 3. Spell out any number that starts a sentence.
- **The spaced em dash and the rhetorical contrast are register markers.** In the
  teaching, labeling, and repo-documentation registers both are banned: use a period, a
  colon, or parentheses, and state what is true without a "not X, a Y" flourish
  (`scripts/check-prose.mjs` enforces this where each repo gates it). In the site's
  persuading register they are signature devices, used deliberately. In the books, lore
  may carry them sparingly. The definition list item (`- **AC** — armor class.`) is fine
  everywhere.
- **Curly quotes** (“ ”) and apostrophes (‘ ’). Straight quotes only inside code.
- **Commas and periods go inside quotation marks**; colons and semicolons outside.
- **Parentheses**: the period goes outside, unless the whole sentence is inside them.
- **Phrasal verbs**: "sign in" (verb), "the sign-in screen" (modifier). "Set up" a campaign;
  the "setup" is the result.
- **Code formatting** for anything typed literally: `2d6+3`, `+5`, `-8`, `4d6kh3`, file names,
  JSON. Not for UI labels, which are bold.
- **Ampersands** are allowed in page titles and sidebar labels ("Effects & conditions") for
  width. Use "and" in prose.

---

## Game text mechanics

Two repos write game text: the site (the books) and the compendium (stat blocks and
spells). The registers live in those repos' guides; the mechanics below are shared, so
the same creature reads identically on a book page and in the console.

### Numbers and measurements

- **Numerals for anything the game measures**: points, scores, damage, challenge ratings,
  and any trait with a numeric value. "The spell deals 10 fire damage." "A creature with a
  Speed of 25 feet can't keep up."
- **Numerals for durations of a game effect**, and for distances that set the size or extent
  of one: "lasts for 1 round", "for the next 10 minutes", "a range of 30 feet", "extends 5
  feet beyond the doorway".
- **Numerals for tactical-scale dimensions**: "the room is 20 feet square", "60 feet by 40
  feet", "6 feet tall".
- **Spell out everything else**, including large-scale distance and time that isn't a game
  effect: "forty acres of stubble", "the two cities are fifty miles apart", "they wandered
  for three days".
- **Spell out the unit in prose.** "30 feet", not "30 ft." — `ft.` belongs to stat blocks
  and data fields (`Speed 30 ft.`), never to a sentence.
- **Use the real characters**: a true minus sign (−, U+2212) rather than a hyphen, × rather
  than the letter x, and ½ ¼ ⅓ ⅔ ¾ for fractions set against a numeral.
- **Say "half"**, not "one-half". Write "10 fire damage", not "10 points of fire damage".
- **Avoid weeks and months** for durations. The length of a week varies by world. Use days.

### Formatting game terms

The published guide dates from the 2014 rules, and no updated one exists for 2024. The
list below is what the 2024 rules actually do, measured across the SRD 5.2.1 text we ship
(330 creatures, ~190,000 characters): damage types, conditions, Hit Points, Speed, and
Advantage/Disadvantage are capitalized there without a single exception.

- **Capitalize** ability scores, Armor Class, Difficulty Class, Challenge Rating, skills,
  languages, planes, and the named traits and actions of a creature.
- **Capitalize, per the 2024 rules**: damage types (Fire damage, Piercing damage),
  conditions (Prone, Frightened, Restrained), Hit Points, Temporary Hit Points, Speed and
  its variants (Fly Speed), Advantage and Disadvantage, Difficult Terrain, Half Cover, and
  the area shapes (Cone, Emanation, Line, Sphere).
- **Only when it is the game term.** "A creature's Speed can't be reduced" takes the
  capital; "they cannot move at speed" is ordinary English and does not.
- Lowercase stays for the ordinary words: ability, attack roll, damage roll, round,
  saving throw in running prose, spell, cantrip, spell slot.
- This applies to game content only. The handbook, the marketing site, and the app keep
  the lowercase house forms in the [words table](#words-we-use), so "armor class" there.
- **Capitalize spell and magic item names**, with no italics, the way the SRD 5.2.1 text
  writes them: Lesser Restoration, Flame Tongue. The capitals mark the title, so a Wall of
  Fire spell produces a wall of fire. (The 2014 italic-lowercase style is retired.)
- **Inline subheads take a period, not a colon**, and are set in bold: **Terrain.** not
  **Terrain:**. A stat-block data field is different: a bold label and a value.
  In chapter prose they belong only to list items and Running it notes: a freestanding
  rule gets its own heading or a Note aside, never a bold-led paragraph.
- **Introduce every vertical list with a complete sentence ending in a colon.** Capitalize
  each item; punctuate items only when they are complete sentences.

### Wording

- You _make_ a saving throw. Never "roll" one, which is redundant. Prefer "the target must
  make a saving throw" over "the target makes a saving throw".
- Don't confuse making a roll with succeeding on one: "succeed on a DC 15 Strength check".
- An attack _roll_ has advantage or disadvantage, not the attack.
- "Magic" is the adjective for an object with magical qualities (a magic item, a magic
  sword); "magical" for most other uses. Never "magical item".
- A creature's **hit point maximum**, not its "maximum hit points".
- Proficiency is _in_ a skill or language, and _with_ a tool, weapon, or armor.
