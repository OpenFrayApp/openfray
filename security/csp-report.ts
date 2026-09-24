// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

import {
  failureResponse,
  FixedWindowRateLimiter,
  identifyResponse,
  publicRequestId,
  PUBLIC_ROUTE_POLICIES,
  readBoundedBody,
  type PublicRateLimiter,
  type PublicRouteDiagnostic,
} from '../public-boundary/route.ts'

const DIRECTIVES = new Set([
  'default-src',
  'script-src',
  'script-src-elem',
  'script-src-attr',
  'style-src',
  'style-src-elem',
  'style-src-attr',
  'img-src',
  'font-src',
  'connect-src',
  'frame-src',
  'frame-ancestors',
  'worker-src',
  'media-src',
  'manifest-src',
  'base-uri',
  'form-action',
  'object-src',
])
const DISPOSITIONS = new Set(['enforce', 'report'])

type DiagnosticLogger = (diagnostic: CspDiagnostic | PublicRouteDiagnostic) => void

/** The fixed, privacy-safe projection retained from a browser CSP report. */
export interface CspDiagnostic {
  kind: 'csp-violation'
  directive: string
  disposition: 'enforce' | 'report'
  statusCode: number
  resourceClass: string
}

/** Return a no-store response without reflecting report data. */
function answer(status: number, requestId: string): Response {
  return identifyResponse(
    new Response(null, { status, headers: { 'cache-control': 'no-store' } }),
    requestId,
  )
}

/** Reduce a blocked address to a fixed resource class without retaining its URL. */
function resourceClass(value: unknown): string {
  if (typeof value !== 'string') return 'other'
  if (value === 'inline' || value === 'eval') return value
  if (value.startsWith('/')) return 'self'
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(value)?.[1]?.toLowerCase()
  return new Set(['blob', 'data', 'http', 'https', 'ws', 'wss']).has(scheme ?? '')
    ? (scheme as string)
    : 'other'
}

/** Parse one browser report into the only fields permitted in diagnostics. */
function parseDiagnostic(bytes: Uint8Array): CspDiagnostic | null {
  let value: unknown
  try {
    value = JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    return null
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const report = (value as Record<string, unknown>)['csp-report']
  if (typeof report !== 'object' || report === null || Array.isArray(report)) return null
  const fields = report as Record<string, unknown>
  const directive = fields['effective-directive']
  const disposition = fields.disposition
  const statusCode = fields['status-code']
  if (
    typeof directive !== 'string' ||
    !DIRECTIVES.has(directive) ||
    typeof disposition !== 'string' ||
    !DISPOSITIONS.has(disposition) ||
    !Number.isInteger(statusCode) ||
    (statusCode as number) < 0 ||
    (statusCode as number) > 599
  ) {
    return null
  }
  return {
    kind: 'csp-violation',
    directive,
    disposition: disposition as 'enforce' | 'report',
    statusCode: statusCode as number,
    resourceClass: resourceClass(fields['blocked-uri']),
  }
}

/** Accept one CSP report and retain only its bounded, non-identifying projection. */
export async function handleCspReportRequest(
  request: Request,
  log: DiagnosticLogger = console.log,
  limiter: PublicRateLimiter = new FixedWindowRateLimiter(),
): Promise<Response> {
  const requestId = publicRequestId()
  /** Return one classified CSP-report failure with privacy-safe diagnostics. */
  const fail = (failure: 'invalid' | 'limited' | 'unavailable' | 'timed_out') =>
    failureResponse(answer(200, requestId), 'csp-report', failure, requestId, log)
  if (request.method !== 'POST') return answer(405, requestId)
  if (request.headers.get('content-type')?.split(';', 1)[0].trim() !== 'application/csp-report') {
    return answer(415, requestId)
  }
  const admission = await limiter.allow(request, PUBLIC_ROUTE_POLICIES['csp-report'])
  if (admission !== true) return fail(admission === 'unavailable' ? 'unavailable' : 'limited')
  const body = await readBoundedBody(
    request,
    PUBLIC_ROUTE_POLICIES['csp-report'].requestBytes,
    AbortSignal.timeout(PUBLIC_ROUTE_POLICIES['csp-report'].timeoutMs),
  )
  if (body === 'large') return answer(413, requestId)
  if (body === 'timed_out') return fail('timed_out')
  if (!body) return fail('invalid')
  const diagnostic = parseDiagnostic(body)
  if (!diagnostic) return fail('invalid')
  log(diagnostic)
  return answer(204, requestId)
}
