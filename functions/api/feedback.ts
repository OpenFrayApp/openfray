// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

import { handleFeedbackRequest, type FeedbackEnv } from '../../feedback-boundary/feedback.ts'

/** Route anonymous console feedback through verification and private server credentials. */
export const onRequest: PagesFunction<FeedbackEnv> = async ({ request, env }) =>
  handleFeedbackRequest(request, env)
