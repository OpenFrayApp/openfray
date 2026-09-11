// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

export type PublicRouteName = 'share' | 'image' | 'report' | 'csp-report'

export interface PublicRoutePolicy {
  name: PublicRouteName
  requests: number
  windowMs: number
  timeoutMs: number
  requestBytes: number
  responseBytes: number
}

export interface PublicRateLimiter {
  allow(request: Request, policy: PublicRoutePolicy): Promise<boolean | 'unavailable'>
}

export interface PublicRouteEnv {
  PUBLIC_ROUTE_FINGERPRINT_KEY?: string
  PUBLIC_ROUTE_RATE_LIMITER?: {
    fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>
  }
  PUBLIC_ROUTE_LIMITER?: PublicRateLimiter
}

export type PublicRouteFailure = 'invalid' | 'limited' | 'missing' | 'unavailable' | 'timed_out'

export interface PublicRouteDiagnostic {
  kind: 'public-route'
  requestId: string
  route: PublicRouteName
  outcome: PublicRouteFailure
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
type BoundedBody = Uint8Array | 'large' | 'timed_out' | null

export type BoundedResponse =
  | { status: 'ok'; body: Uint8Array; response: Response }
  | { status: 'large' | 'unavailable' | 'timed_out' }

type BoundedJson =
  | { status: 'ok'; value: unknown; response: Response }
  | { status: 'large' | 'invalid' | 'unavailable' | 'timed_out' }

interface WindowEntry {
  count: number
  expiresAt: number
}

export const PUBLIC_ROUTE_POLICIES = {
  share: {
    name: 'share',
    requests: 120,
    windowMs: 60_000,
    timeoutMs: 2_000,
    requestBytes: 0,
    responseBytes: 65_536,
  },
  image: {
    name: 'image',
    requests: 30,
    windowMs: 60_000,
    timeoutMs: 4_000,
    requestBytes: 0,
    responseBytes: 1_048_576,
  },
  report: {
    name: 'report',
    requests: 10,
    windowMs: 60_000,
    timeoutMs: 5_000,
    requestBytes: 4_096,
    responseBytes: 65_536,
  },
  'csp-report': {
    name: 'csp-report',
    requests: 60,
    windowMs: 60_000,
    timeoutMs: 1_000,
    requestBytes: 4_096,
    responseBytes: 0,
  },
} as const satisfies Record<PublicRouteName, PublicRoutePolicy>

/** Return a lowercase canonical cache request without query or fragment variance. */
export function canonicalRouteRequest(request: Request, pathname: string): Request {
  const url = new URL(request.url)
  url.pathname = pathname.toLowerCase()
  url.search = ''
  url.hash = ''
  return new Request(url.toString(), { method: 'GET' })
}

/** Return an opaque identifier suitable for a response header and bounded diagnostics. */
export function publicRequestId(): string {
  return crypto.randomUUID()
}

/** Return the milliseconds left under one absolute deadline. */
export function remainingTime(deadline: number): number {
  return Math.max(1, deadline - Date.now())
}

/** Return the Workers runtime's shared cache when the runtime provides it. */
export function workersCache(): Cache | null {
  const storage = (globalThis as typeof globalThis & { caches?: CacheStorage }).caches
  return storage ? (storage as unknown as { default: Cache }).default : null
}

/** Resolve Supabase coordinates under either supported environment spelling. */
export function supabaseCoordinates(env: {
  SUPABASE_URL?: string
  SUPABASE_ANON_KEY?: string
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_ANON_KEY?: string
}): { url: string; key: string } | null {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL
  const key = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY
  return url && key ? { url: url.replace(/\/$/, ''), key } : null
}

/** Return the HTTP status assigned to one bounded public-route failure. */
export function publicFailureStatus(failure: PublicRouteFailure): number {
  if (failure === 'invalid') return 400
  if (failure === 'limited') return 429
  if (failure === 'missing') return 404
  if (failure === 'timed_out') return 504
  return 503
}

/** Attach an opaque incident identifier without exposing any request value. */
export function identifyResponse(response: Response, requestId: string): Response {
  const headers = new Headers(response.headers)
  headers.set('x-request-id', requestId)
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

/** Turn a generic fallback body into a classified privacy-safe failure response. */
export function failureResponse(
  response: Response,
  route: PublicRouteName,
  failure: PublicRouteFailure,
  requestId: string,
  log: (diagnostic: PublicRouteDiagnostic) => void = console.log,
): Response {
  log({ kind: 'public-route', requestId, route, outcome: failure })
  const headers = new Headers(response.headers)
  headers.set('cache-control', 'no-store')
  headers.set('x-request-id', requestId)
  return new Response(response.body, { status: publicFailureStatus(failure), headers })
}

/** Resolve when work completes or reject when its abort signal fires. */
async function raceAbort<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw signal.reason
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}

/** Read a request or response body while enforcing byte and elapsed-time ceilings. */
export async function readBoundedBody(
  source: Pick<Request, 'body' | 'headers'>,
  maximumBytes: number,
  signal: AbortSignal,
): Promise<BoundedBody> {
  const declared = Number(source.headers.get('content-length') ?? 0)
  if (Number.isFinite(declared) && declared > maximumBytes) return 'large'
  if (!source.body) return null
  const reader = source.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await raceAbort(reader.read(), signal)
      if (done) break
      size += value.byteLength
      if (size > maximumBytes) {
        await reader.cancel()
        return 'large'
      }
      chunks.push(value)
    }
  } catch {
    await reader.cancel().catch(() => undefined)
    return signal.aborted ? 'timed_out' : null
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

/** Fetch one response under explicit response-size and elapsed-time ceilings. */
export async function boundedResponse(
  fetcher: Fetcher,
  input: RequestInfo | URL,
  init: RequestInit,
  bounds: { timeoutMs: number; responseBytes: number },
): Promise<BoundedResponse> {
  const signal = AbortSignal.timeout(bounds.timeoutMs)
  try {
    const response = await raceAbort(fetcher(input, { ...init, signal }), signal)
    const body = await readBoundedBody(response, bounds.responseBytes, signal)
    if (body === 'large') return { status: 'large' }
    if (body === 'timed_out') return { status: 'timed_out' }
    if (!body) return { status: 'unavailable' }
    return { status: 'ok', body, response }
  } catch {
    return { status: signal.aborted ? 'timed_out' : 'unavailable' }
  }
}

/** Fetch and decode JSON under explicit response-size and elapsed-time ceilings. */
export async function boundedJson(
  fetcher: Fetcher,
  input: RequestInfo | URL,
  init: RequestInit,
  bounds: { timeoutMs: number; responseBytes: number },
): Promise<BoundedJson> {
  const result = await boundedResponse(fetcher, input, init, bounds)
  if (result.status !== 'ok') return result
  try {
    return {
      status: 'ok',
      value: JSON.parse(new TextDecoder().decode(result.body)) as unknown,
      response: result.response,
    }
  } catch {
    return { status: 'invalid' }
  }
}

let limiterSalt: Uint8Array | null = null

/** Return the isolate-local random salt, created during request handling. */
function localLimiterSalt(): Uint8Array {
  limiterSalt ??= crypto.getRandomValues(new Uint8Array(32))
  return limiterSalt
}

/** Return a lowercase hexadecimal encoding of bytes. */
function hexadecimal(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** Return the bounded network value supplied by Cloudflare. */
function networkValue(request: Request): string {
  const network = request.headers.get('cf-connecting-ip')?.trim() || 'unknown'
  return network.length <= 64 ? network : 'invalid'
}

/** Hash one network identifier with an isolate-local salt before retaining it. */
async function networkKey(request: Request): Promise<string> {
  const address = new TextEncoder().encode(networkValue(request))
  const salt = localLimiterSalt()
  const input = new Uint8Array(salt.byteLength + address.byteLength)
  input.set(salt)
  input.set(address, salt.byteLength)
  return hexadecimal(await crypto.subtle.digest('SHA-256', input))
}

/** Derive a stable opaque key for the shared rate-limit service. */
async function sharedNetworkKey(request: Request, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return hexadecimal(await crypto.subtle.sign('HMAC', key, encoder.encode(networkValue(request))))
}

/** Enforce bounded per-isolate fixed windows with independent route thresholds. */
export class FixedWindowRateLimiter implements PublicRateLimiter {
  private readonly entries = new Map<string, WindowEntry>()

  constructor(
    private readonly maximumEntries = 2_048,
    private readonly now: () => number = Date.now,
  ) {}

  /** Admit one request when its route and network window remains below the threshold. */
  async allow(request: Request, policy: PublicRoutePolicy): Promise<boolean> {
    const now = this.now()
    const key = `${policy.name}:${await networkKey(request)}`
    const current = this.entries.get(key)
    if (current && current.expiresAt > now) {
      if (current.count >= policy.requests) return false
      current.count += 1
      return true
    }
    if (this.entries.size >= this.maximumEntries) this.removeExpired(now)
    if (this.entries.size >= this.maximumEntries && !this.entries.has(key)) return false
    this.entries.set(key, { count: 1, expiresAt: now + policy.windowMs })
    return true
  }

  /** Expose stored opaque keys for privacy-boundary tests. */
  identifiers(): string {
    return [...this.entries.keys()].join(',')
  }

  /** Remove windows that can no longer affect admission. */
  private removeExpired(now: number): void {
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key)
    }
  }
}

/** Enforce route windows through the deployment's shared rate-limit Worker. */
class SharedRateLimiter implements PublicRateLimiter {
  constructor(
    private readonly service: NonNullable<PublicRouteEnv['PUBLIC_ROUTE_RATE_LIMITER']>,
    private readonly secret: string,
  ) {}

  /** Ask the shared service to admit one opaque network and route key. */
  async allow(request: Request, policy: PublicRoutePolicy): Promise<boolean | 'unavailable'> {
    try {
      const response = await this.service.fetch(`https://rate-limit.internal/${policy.name}`, {
        method: 'POST',
        headers: { 'x-openfray-rate-key': await sharedNetworkKey(request, this.secret) },
        signal: AbortSignal.timeout(250),
      })
      if (response.status === 204) return true
      return response.status === 429 ? false : 'unavailable'
    } catch {
      return 'unavailable'
    }
  }
}

/** Reject work when the deployment omitted its required shared limiter binding. */
class UnavailableRateLimiter implements PublicRateLimiter {
  /** Reject every request without retaining request data. */
  async allow(): Promise<'unavailable'> {
    return 'unavailable'
  }
}

const unavailableRateLimiter: PublicRateLimiter = new UnavailableRateLimiter()

/** Resolve the injected test limiter or the required deployment service binding. */
export function routeRateLimiter(env: PublicRouteEnv): PublicRateLimiter {
  if (env.PUBLIC_ROUTE_LIMITER) return env.PUBLIC_ROUTE_LIMITER
  if (env.PUBLIC_ROUTE_RATE_LIMITER && env.PUBLIC_ROUTE_FINGERPRINT_KEY) {
    return new SharedRateLimiter(env.PUBLIC_ROUTE_RATE_LIMITER, env.PUBLIC_ROUTE_FINGERPRINT_KEY)
  }
  return unavailableRateLimiter
}
