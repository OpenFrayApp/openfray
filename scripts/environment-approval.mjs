// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { SAFE_PROMOTION_IDENTITY } from './promotion-contract.mjs'

/** Select the latest approving reviewer for one protected environment. */
export function environmentApprover(reviews, environment) {
  if (!SAFE_PROMOTION_IDENTITY.test(environment) || !Array.isArray(reviews)) return null
  const approvals = reviews.filter(
    (review) =>
      review?.state === 'approved' &&
      review?.environments?.some((entry) => entry?.name === environment) &&
      SAFE_PROMOTION_IDENTITY.test(review?.user?.login ?? ''),
  )
  return approvals.at(-1)?.user.login ?? null
}

/** Read GitHub review history and export its authorized reviewer. */
function main() {
  const environment = process.argv[2]
  const approver = environmentApprover(JSON.parse(readFileSync(0, 'utf8')), environment)
  if (!approver) throw new Error(`No approval found for ${environment ?? 'the environment'}.`)
  console.log(`PROMOTION_APPROVER=${approver}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
