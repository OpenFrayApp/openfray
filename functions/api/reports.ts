// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

import { handleReportRequest, type ReportEnv } from '../../report-boundary/report.ts'

/** Accept one anonymous report through the deployment-owned abuse boundary. */
export const onRequestPost: PagesFunction<ReportEnv> = async ({ request, env }) =>
  handleReportRequest(request, env)
