// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

/** Read a successful Vitest JSON report as a portable file and case inventory. */
export function testInventory(report) {
  if (report.success !== true || !report.testResults?.length) {
    throw new Error('Expected a successful, nonempty Vitest JSON report')
  }
  const files = new Map()
  let cases = 0
  for (const result of report.testResults) {
    const path = result.name.replaceAll('\\', '/')
    const marker = path.lastIndexOf('/tests/')
    const name = marker >= 0 ? path.slice(marker + 1) : path
    if (!name.startsWith('tests/') || files.has(name)) {
      throw new Error(`Invalid or repeated test file: ${name}`)
    }
    const assertions = result.assertionResults.map((assertion) => {
      if (!['passed', 'pending', 'todo', 'skipped', 'disabled'].includes(assertion.status)) {
        throw new Error(`Unsuccessful test: ${name}: ${assertion.fullName}`)
      }
      return JSON.stringify([assertion.fullName, assertion.status])
    })
    cases += assertions.length
    files.set(name, assertions.sort())
  }
  if (cases !== report.numTotalTests) {
    throw new Error(`Incomplete report: ${cases} cases, expected ${report.numTotalTests}`)
  }
  return files
}

/** Require shards to reproduce every baseline file and case exactly once. */
export function verifyTestShards(baseline, shards) {
  if (shards.length < 2) throw new Error('Provide at least two shard reports')
  const expected = testInventory(baseline)
  const actual = new Map()
  for (const shard of shards) {
    for (const [name, cases] of testInventory(shard)) {
      if (actual.has(name)) throw new Error(`File executed in multiple shards: ${name}`)
      actual.set(name, cases)
    }
  }
  for (const [name, cases] of expected) {
    if (JSON.stringify(actual.get(name)) !== JSON.stringify(cases)) {
      throw new Error(`Missing or changed test inventory: ${name}`)
    }
    actual.delete(name)
  }
  if (actual.size) throw new Error(`Unexpected shard files: ${[...actual.keys()].join(', ')}`)
  return {
    files: expected.size,
    cases: [...expected.values()].reduce((total, cases) => total + cases.length, 0),
    shards: shards.map((shard) => ({
      files: shard.testResults.length,
      cases: shard.numTotalTests,
      fileMilliseconds: shard.testResults.reduce(
        (total, result) => total + result.endTime - result.startTime,
        0,
      ),
    })),
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [baseline, ...shards] = process.argv
      .slice(2)
      .map((path) => JSON.parse(readFileSync(path, 'utf8')))
    console.log(JSON.stringify(verifyTestShards(baseline, shards), null, 2))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
