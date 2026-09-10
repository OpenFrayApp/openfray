// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { onRequestGet } from '../../functions/s/[code].ts'
import type { CardEnv } from '../../share-card/describe.ts'

const CODE = 'k7mqx3rt9p'
const INDEX = {
  'srd-5.2:goblin': { name: 'Goblin', size: 'Small', type: 'humanoid', cr: 0.25, xp: 50 },
}
const publicationFixture = JSON.parse(
  readFileSync(
    new URL('../../console/tests/fixtures/hardening/publication.json', import.meta.url),
    'utf8',
  ),
) as { cases: { id: string; kind: string; input: unknown }[] }

/** Return one canonical publication fixture in the database row envelope. */
function publicationCase(id: string): { kind: string; data: unknown } {
  const fixture = publicationFixture.cases.find((candidate) => candidate.id === id)
  if (!fixture) throw new Error(`Missing publication fixture: ${id}`)
  return { kind: fixture.kind, data: fixture.input }
}

const canonical = publicationCase('published-encounter')
let rewrittenValues: Record<string, string>

/** Minimal HTMLRewriter preserving the shell while exposing requested metadata values. */
class Rewriter {
  /** Run registered element handlers against the metadata fields the shell declares. */
  on(selector: string, handler: { element(element: unknown): void }): this {
    if (selector === 'title') {
      handler.element({
        setInnerContent(value: string) {
          rewrittenValues.title = value
        },
      })
      return this
    }
    for (const key of [
      'description',
      'og:title',
      'og:description',
      'og:url',
      'og:image',
      'og:image:alt',
    ]) {
      handler.element({
        getAttribute(attribute: string) {
          return attribute === 'property' || attribute === 'name' ? key : null
        },
        setAttribute(attribute: string, value: string) {
          if (attribute === 'content') rewrittenValues[key] = value
        },
      })
    }
    return this
  }

  /** Return the shell unchanged while proving that decoration was selected. */
  transform(response: Response): Response {
    return response
  }
}

/** Run the assembled share Function against one synthetic database row. */
async function route(
  row: unknown,
  index: unknown = INDEX,
  overrides: Partial<CardEnv> = {},
  code = CODE,
  query = '',
  shell = '<html>generic</html>',
): Promise<Response> {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify(row), { headers: { 'content-type': 'application/json' } }),
    ),
  )
  const env: CardEnv = {
    SUPABASE_URL: 'https://db.example',
    SUPABASE_ANON_KEY: 'anon',
    PUBLIC_ROUTE_LIMITER: { allow: async () => true },
    ASSETS: {
      async fetch() {
        return new Response(JSON.stringify(index))
      },
    },
    ...overrides,
  }
  return onRequestGet({
    params: { code },
    env,
    request: new Request(`https://openfray.app/s/${code}${query}`),
    next: async () => new Response(shell, { headers: { 'x-generic': 'true' } }),
  } as never)
}

beforeEach(() => {
  rewrittenValues = {}
  vi.stubGlobal('HTMLRewriter', Rewriter)
})
afterEach(() => vi.unstubAllGlobals())

describe('assembled shared route', () => {
  it.each([
    ['canonical', canonical],
    ['legacy', publicationCase('legacy-published-encounter')],
    ['licensed creature', publicationCase('licensed-creature')],
  ])('decorates %s publication content', async (_label, row) => {
    expect((await route(row)).headers.get('cache-control')).toBe('public, s-maxage=300')
  })

  it('carries the allowlisted license fact into assembled metadata', async () => {
    await route(publicationCase('licensed-creature'))
    expect(rewrittenValues['og:image:alt']).toContain('CC BY-SA 4.0')
  })

  it('rejects a malformed capability before rate-limit or upstream work', async () => {
    const limiter = vi.fn(async () => false)
    const response = await route(
      canonical,
      INDEX,
      { PUBLIC_ROUTE_LIMITER: { allow: limiter } },
      'not-a-code',
    )

    expect(response.status).toBe(400)
    expect(limiter).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('returns the generic shell without upstream work when limited', async () => {
    const response = await route(canonical, INDEX, {
      PUBLIC_ROUTE_LIMITER: { allow: async () => false },
    })

    expect(response.status).toBe(429)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('uses a fixed minimal fallback when the static shell exceeds its ceiling', async () => {
    const response = await route(canonical, INDEX, {}, CODE, '', 'x'.repeat(70_000))

    expect(response.status).toBe(503)
    expect(await response.text()).toBe('<!doctype html><title>OpenFray</title>')
  })

  it('uses one normalized cache key across case and query variants', async () => {
    const keys: string[] = []
    vi.stubGlobal('caches', {
      default: {
        /** Record and answer one normalized cache lookup. */
        async match(input: Request) {
          keys.push(input.url)
          return new Response('cached-shell')
        },
      },
    })
    const limiter = { PUBLIC_ROUTE_LIMITER: { allow: async () => true } }

    await route(canonical, INDEX, limiter, CODE.toUpperCase(), '?utm_source=one')
    await route(canonical, INDEX, limiter, CODE, '?utm_source=two')

    expect(keys).toEqual([`https://openfray.app/s/${CODE}`, `https://openfray.app/s/${CODE}`])
  })

  it.each([
    ['malformed', { kind: 'encounter', data: { v: 1 } }, INDEX],
    [
      'unsupported',
      {
        kind: 'encounter',
        data: {
          v: 2,
          name: 'Future fixture',
          entries: [{ quick: { name: 'Scout', maxHp: 8, ac: 12 }, count: 1, side: 'friend' }],
        },
      },
      INDEX,
    ],
    [
      'hostile',
      {
        kind: 'encounter',
        data: JSON.parse('{"v":1,"name":"Hostile","entries":[],"__proto__":{"polluted":true}}'),
      },
      INDEX,
    ],
    ['missing compendium', publicationCase('missing-compendium'), {}],
  ])('keeps the generic fallback for %s content', async (_label, row, index) => {
    const response = await route(row, index)
    expect(response.status).toBe(404)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('x-generic')).toBe('true')
    expect(await response.text()).toContain('generic')
  })
})
