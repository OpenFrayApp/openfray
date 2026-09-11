// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Parse the bounded deployment-result command-line interface. */
function parseOptions(arguments_) {
  const options = {}
  for (let index = 0; index < arguments_.length; index += 2) {
    const option = arguments_[index]
    const value = arguments_[index + 1]
    if (typeof value !== 'string') throw new Error(`Missing value for ${option}`)
    if (option === '--manifest') options.manifest = value
    else if (option === '--result' && new Set(['passed', 'failed']).has(value)) {
      options.result = value
    } else throw new Error(`Unsupported deployment-result option: ${option}`)
  }
  if (!options.manifest || !options.result) {
    throw new Error('Deployment recording requires a manifest and result.')
  }
  return options
}

/** Finalize a successful gate manifest with the observed deployment result. */
export function recordProductionDeployment(path, result) {
  const manifest = JSON.parse(readFileSync(path, 'utf8'))
  if (manifest?.schemaVersion !== 1 || manifest?.result !== 'passed') {
    throw new Error('Only a passing promotion gate can record deployment.')
  }
  const completedAt = new Date().toISOString()
  manifest.deployment = { result, completedAt }
  manifest.promotedAt = result === 'passed' ? completedAt : null
  if (result === 'failed') {
    manifest.result = 'failed'
    manifest.failureReasons.push('deployment-failed')
  }
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`)
  return manifest
}

/** Record the deployment outcome in the release manifest. */
function main() {
  const options = parseOptions(process.argv.slice(2))
  const manifest = recordProductionDeployment(resolve(options.manifest), options.result)
  console.log(`Production deployment ${manifest.deployment.result}.`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
