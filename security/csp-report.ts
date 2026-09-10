// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

const REPORT_BYTES = 4096
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

type DiagnosticLogger = (diagnostic: CspDiagnostic) => void

/** The fixed, privacy-safe projection retained from a browser CSP report. */
export interface CspDiagnostic {
  kind: 'csp-violation'
  directive: string
  disposition: 'enforce' | 'report'
  statusCode: number
  resourceClass: string
}

/** Return a no-store response without reflecting report data. */
function answer(status: number): Response {
  return new Response(null, { status, headers: { 'cache-control': 'no-store' } })
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

/** Read at most one bounded report body and cancel the stream at the ceiling. */
async function readBoundedBody(request: Request): Promise<Uint8Array | 'large' | null> {
  if (!request.body) return null
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > REPORT_BYTES) {
        await reader.cancel()
        return 'large'
      }
      chunks.push(value)
    }
  } catch {
    return null
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

/** Parse one browser report into the only fields permitted in diagnostics. */
async function parseDiagnostic(request: Request): Promise<CspDiagnostic | 'large' | null> {
  const declared = Number(request.headers.get('content-length') ?? 0)
  if (Number.isFinite(declared) && declared > REPORT_BYTES) return 'large'
  const bytes = await readBoundedBody(request)
  if (bytes === 'large' || bytes === null) return bytes
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
): Promise<Response> {
  if (request.method !== 'POST') return answer(405)
  if (request.headers.get('content-type')?.split(';', 1)[0].trim() !== 'application/csp-report') {
    return answer(415)
  }
  const diagnostic = await parseDiagnostic(request)
  if (diagnostic === 'large') return answer(413)
  if (!diagnostic) return answer(400)
  log(diagnostic)
  return answer(204)
}
