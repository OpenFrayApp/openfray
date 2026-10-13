// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

import { describe, expect, it } from 'vitest'
import { testInventory, verifyTestShards } from '../../scripts/verify-test-shards.mjs'

/** Make a minimal Vitest JSON report with independently named cases. */
function report(files: string[], root = '/workspace/console') {
  return {
    success: true,
    numTotalTests: files.length * 2,
    testResults: files.map((file) => ({
      name: `${root}/tests/${file}.test.ts`,
      startTime: 100,
      endTime: 110,
      assertionResults: [
        { fullName: `${file} first case`, status: 'passed' },
        { fullName: `${file} second case`, status: 'passed' },
      ],
    })),
  }
}

describe('shard inventory verification', () => {
  it('matches files and cases across checkout roots and reports file timing separately', () => {
    expect(
      verifyTestShards(report(['a', 'b']), [report(['b'], '/other/console'), report(['a'])]),
    ).toEqual({
      files: 2,
      cases: 4,
      shards: [
        { files: 1, cases: 2, fileMilliseconds: 10 },
        { files: 1, cases: 2, fileMilliseconds: 10 },
      ],
    })
  })

  it('rejects missing, repeated, and unexpected files', () => {
    const baseline = report(['a', 'b', 'c'])
    expect(() => verifyTestShards(baseline, [report(['a']), report(['b'])])).toThrow('Missing')
    expect(() => verifyTestShards(baseline, [report(['a', 'b']), report(['b', 'c'])])).toThrow(
      'multiple shards',
    )
    expect(() => verifyTestShards(baseline, [report(['a', 'b']), report(['c', 'd'])])).toThrow(
      'Unexpected',
    )
  })

  it('compares case multiplicity and execution status without relying on case counts', () => {
    const shard = report(['a'])
    shard.testResults[0].assertionResults[1].fullName = 'a first case'
    expect(() => verifyTestShards(report(['a', 'b']), [shard, report(['b'])])).toThrow('changed')
    shard.testResults[0].assertionResults[1] = { fullName: 'a second case', status: 'pending' }
    expect(() => verifyTestShards(report(['a', 'b']), [shard, report(['b'])])).toThrow('changed')
  })

  it('fails closed on unsuccessful, empty, incomplete, or repeated-file reports', () => {
    expect(() => testInventory({ ...report(['a']), success: false })).toThrow('successful')
    expect(() => testInventory(report([]))).toThrow('nonempty')
    expect(() => testInventory({ ...report(['a']), numTotalTests: 3 })).toThrow('Incomplete')
    expect(() => testInventory(report(['a', 'a']))).toThrow('repeated')
    const failed = report(['a'])
    failed.testResults[0].assertionResults[0].status = 'failed'
    expect(() => testInventory(failed)).toThrow('Unsuccessful')
    expect(() => verifyTestShards(report(['a']), [report(['a'])])).toThrow('at least two')
  })
})
