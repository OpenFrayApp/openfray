// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

import { spawnSync } from 'node:child_process'
import { publicAuthEnvironment } from './public-auth-environment.mjs'

const env = { ...process.env, ...publicAuthEnvironment(process.env) }
const result = spawnSync('npm', ['run', 'build:parts'], { env, stdio: 'inherit' })
if (result.error) throw result.error
process.exit(result.status ?? 1)
