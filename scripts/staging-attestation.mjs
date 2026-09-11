// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  PROMOTION_BOUNDARIES,
  PROMOTION_CHECK_RESULTS,
  SAFE_PROMOTION_IDENTITY,
  optionPairs,
} from './promotion-contract.mjs'
import { verifyProductionPromotion } from './production-promotion.mjs'

/** Parse the bounded staging-attestation command-line interface. */
function parseOptions(arguments_) {
  const options = { results: {} }
  for (const [option, value] of optionPairs(arguments_)) {
    if (option === '--output') options.output = value
    else if (option === '--rollback-target') options.rollbackTarget = value
    else if (option === '--environment' && SAFE_PROMOTION_IDENTITY.test(value)) {
      options.environment = value
    } else if (option === '--approver' && SAFE_PROMOTION_IDENTITY.test(value)) {
      options.approver = value
    } else if (option === '--rollback-exercise' && value === 'passed') {
      options.rollbackExercise = value
    } else {
      const boundary = option.replace(/^--/, '')
      if (PROMOTION_BOUNDARIES.includes(boundary) && PROMOTION_CHECK_RESULTS.has(value)) {
        options.results[boundary] = value
      } else throw new Error(`Unsupported staging-attestation option: ${option}`)
    }
  }
  if (
    !options.output ||
    !options.rollbackTarget ||
    !options.environment ||
    !options.approver ||
    !options.rollbackExercise ||
    PROMOTION_BOUNDARIES.some((boundary) => !options.results[boundary])
  ) {
    throw new Error('Staging attestation requires every documented input.')
  }
  return options
}

/** Create a reviewed staging attestation bound to the checked-out candidate. */
export function createStagingAttestation(options) {
  const inspection = verifyProductionPromotion({
    root: options.root ?? process.cwd(),
    output: '.artifacts/staging-candidate-inspection',
    rollbackTarget: options.rollbackTarget,
    approver: 'staging-inspection',
    productionEnvironment: 'staging-inspection',
  })
  if (inspection.releaseClass !== 'critical') {
    throw new Error('Ordinary candidates do not require a staging attestation.')
  }
  for (const boundary of PROMOTION_BOUNDARIES) {
    const expected = inspection.applicableBoundaries.includes(boundary)
      ? 'passed'
      : 'not-applicable'
    if (options.results[boundary] !== expected) {
      throw new Error(`The ${boundary} result does not match the candidate.`)
    }
  }
  const recordedAt = new Date().toISOString()
  return {
    schemaVersion: 1,
    environment: { kind: 'staging', identity: options.environment },
    candidate: {
      repositories: inspection.candidate.repositories,
      migrationHead: inspection.candidate.migrationHead,
      configuration: inspection.candidate.configuration,
    },
    checks: { build: 'passed', ...options.results },
    approvedBy: options.approver,
    recordedAt,
    rollback: {
      repositories: inspection.rollback.repositories,
      migrationHead: inspection.rollback.migrationHead,
      result: options.rollbackExercise,
      exercisedAt: recordedAt,
    },
  }
}

/** Write the staging attestation selected by the protected staging workflow. */
function main() {
  const options = parseOptions(process.argv.slice(2))
  const attestation = createStagingAttestation(options)
  const output = resolve(options.output)
  mkdirSync(dirname(output), { recursive: true })
  writeFileSync(output, `${JSON.stringify(attestation, null, 2)}\n`)
  console.log(`Staging attestation written to ${options.output}.`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
