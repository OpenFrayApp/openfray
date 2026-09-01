// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

// Clears dist/ before a build. Each part cleans its own output (Vite empties
// dist/console, Astro empties site/dist and handbook/dist), but assemble-site.mjs only ever
// copies *into* dist/, so a page that was renamed or removed would linger there and
// keep being served from a reused workspace.
import { rmSync } from 'node:fs'

rmSync('dist', { recursive: true, force: true })
