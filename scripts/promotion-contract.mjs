// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

export const PROMOTION_BOUNDARIES = [
  'migration',
  'authentication',
  'row-level-security',
  'sharing',
  'backup',
]
export const PROMOTION_CHECK_RESULTS = new Set(['passed', 'not-applicable'])
export const SAFE_PROMOTION_IDENTITY = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/

/** Split a command line into validated option-value pairs. */
export function optionPairs(arguments_) {
  if (arguments_.length % 2 !== 0) {
    throw new Error(`Missing value for ${arguments_.at(-1)}`)
  }
  return Array.from({ length: arguments_.length / 2 }, (_, index) => [
    arguments_[index * 2],
    arguments_[index * 2 + 1],
  ])
}
