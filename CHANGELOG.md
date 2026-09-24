# Changelog

Coordinated releases of the console, website, and handbook are recorded here.
Earlier console releases are listed in [the console changelog](./console/CHANGELOG.md).

## 1.3.0 (unreleased)

### Added

- Search creatures, spells, conditions, and saved characters from the console header, with a configurable keyboard shortcut. ([console#41](https://github.com/OpenFrayApp/console/issues/41))
- Choose numeric, Roman numeral, or letter labels for repeated creatures; labels stay stable after removals. ([console#75](https://github.com/OpenFrayApp/console/issues/75))
- Choose creature and ally marker colors, with independent reset arrows beside each picker. ([console#77](https://github.com/OpenFrayApp/console/issues/77))
- Player-view marker colors follow the GM’s tracker by default, with separate overrides controlled by the GM. ([console#77](https://github.com/OpenFrayApp/console/issues/77))

### Changed

- Sign in with Google or Discord directly, with the Terms notice beside the provider buttons and no checkbox.
- The Terms, Privacy Policy, and handbook describe the same sign-in flow and age requirements.
- Save status appears as a compact dot with its message and recovery actions available on hover, focus, or tap.
- The tracker uses updated cleanup icons, and the game log heading separates it from the controls.
- Keyboard focus is visible, initiative rows support arrow-key reordering, and repeated touch controls have larger targets. ([console#42](https://github.com/OpenFrayApp/console/issues/42))
- Website screenshots, demonstration videos, and handbook captures reflect the updated console.

### Fixed

- Reference search includes all enabled creature libraries and available spells; the GM can cast a searched spell in an empty encounter. ([console#41](https://github.com/OpenFrayApp/console/issues/41))
- Player boards keep updating after rolls and resume authorized sharing after the GM reloads.
- The player view reports connection state and covers stale content until a fresh board arrives.
- Offline setup works with hosting redirects, and a prepared console restores signed-in device recovery with the bundled compendium.
- Console updates wait for confirmation and a verified recovery checkpoint; failed installations retain the previous version. ([console#38](https://github.com/OpenFrayApp/console/issues/38))
- Divergent device and cloud copies remain available while the GM chooses which board to continue.
- Cloud-saving takeover stays visible during device saves, and an expired sign-in preserves the working board and device recovery.
