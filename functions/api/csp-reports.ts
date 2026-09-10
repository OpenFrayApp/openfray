// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

import { handleCspReportRequest } from '../../security/csp-report.ts'

/** Accept a browser CSP report through the privacy-safe diagnostics boundary. */
export const onRequestPost: PagesFunction = async ({ request }) => handleCspReportRequest(request)
