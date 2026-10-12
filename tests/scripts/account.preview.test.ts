// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fetchPreview, fetchPreviewScripts } from './preview-http'
import type { Encounter } from '../../console/src/schema/encounter'

const origin = process.env.OPENFRAY_PAGES_ORIGIN
const project = 'https://abcdefghijklmnopqrst.supabase.co'
const storageKey = 'sb-abcdefghijklmnopqrst-auth-token'
let browser: Browser

type User = {
  id: string
  email: string
  app_metadata: { provider: string }
  user_metadata: Record<string, unknown>
}
type Session = {
  access_token: string
  refresh_token: string
  expires_at: number
  expires_in: number
  token_type: string
  user: User
}
type Call = {
  path: string
  method: string
  actor: string | null
  bearer: string
  body: Record<string, unknown> | null
}
type Row = { id: string; state: Encounter; revision: number; updated_at: string; player_code: null }

/** Supply SDK-decodable synthetic credentials; only the mock's exact-token registry grants an actor. */
function syntheticSession(index: number): Session {
  const user: User = {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    email: `gm-${index}@account.invalid`,
    app_metadata: { provider: 'google' },
    user_metadata: { display_name: `GM ${index}`, share_license: 'unstated' },
  }
  const expires_at = Math.floor(Date.now() / 1000) + 3600
  const payload = Buffer.from(JSON.stringify({ sub: user.id, exp: expires_at })).toString(
    'base64url',
  )
  return {
    access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.synthetic-unverified-${index}`,
    refresh_token: `synthetic-refresh-${index}`,
    expires_at,
    expires_in: 3600,
    token_type: 'bearer',
    user,
  }
}

/** Recognize synthetic bearers and implement only the HTTP surfaces exercised by assembled account checks. */
async function mockBackend(context: BrowserContext, sessions: Session[]) {
  const users = new Map(
    sessions.map((session) => [session.access_token, structuredClone(session.user)]),
  )
  const rows = new Map<string, Row>()
  const calls: Call[] = []
  const denied: string[] = []
  const unexpected: string[] = []
  const failures = new Set<string>()
  const holds = new Map<string, { entered: () => void; wait: Promise<void> }>()
  await context.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin === origin) return route.continue()
    if (url.origin !== project) {
      denied.push(request.url())
      return route.abort()
    }
    if (url.pathname === '/auth/v1/authorize' || url.pathname.startsWith('/realtime/')) {
      denied.push(request.url())
      return route.abort()
    }
    const bearer = request.headers().authorization ?? ''
    const user = users.get(bearer.replace(/^Bearer /, ''))
    const body = request.postData() ? (request.postDataJSON() as Record<string, unknown>) : null
    const path = url.pathname
    const method = request.method()
    calls.push({ path, method, actor: user?.id ?? null, bearer, body })
    /** Send one bounded JSON result from the synthetic backend. */
    const reply = (value: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) })
    if (!user) return reply({ message: 'Unrecognized synthetic bearer' }, 401)
    const hold = holds.get(path)
    if (hold) {
      holds.delete(path)
      hold.entered()
      await hold.wait
    }
    if (failures.has(path)) return reply({ message: 'Synthetic unavailable' }, 503)
    if (path === '/auth/v1/user' && method === 'GET') return reply(user)
    if (path === '/auth/v1/user' && method === 'PUT') {
      if (Object.keys(body ?? {}).join() !== 'data')
        return reply({ message: 'Unexpected profile payload' }, 400)
      Object.assign(user.user_metadata, body?.data)
      return reply(user)
    }
    if (path === '/auth/v1/logout' && method === 'POST') return route.fulfill({ status: 204 })
    if (path === '/functions/v1/account-delete' && method === 'POST') {
      if (JSON.stringify(body) !== '{}') return reply({ message: 'Target override forbidden' }, 400)
      rows.delete(user.id)
      return reply({ deleted: true })
    }
    if (path === '/rest/v1/rpc/may_use_reserved_byline') return reply(false)
    if (path === '/rest/v1/rpc/stop_all_live_views') return reply(null)
    if (path === '/rest/v1/rpc/save_encounter_revision') {
      if (body?.want_owner !== user.id) return reply({ message: 'Wrong actor' }, 403)
      const prior = rows.get(user.id)
      if (body?.expected_revision !== (prior?.revision ?? 0))
        return reply({ status: 'stale', revision: prior?.revision ?? 0 })
      const row: Row = {
        id: prior?.id ?? `encounter-${user.id}`,
        state: structuredClone(body?.want_state) as Encounter,
        revision: (prior?.revision ?? 0) + 1,
        updated_at: String(body?.want_updated_at),
        player_code: null,
      }
      rows.set(user.id, row)
      return reply({
        status: 'saved',
        id: row.id,
        revision: row.revision,
        leaseToken: 'synthetic-lease',
      })
    }
    if (path === '/rest/v1/rpc/claim_encounter_writer') {
      const row = rows.get(user.id)
      return reply({
        status: 'acquired',
        revision: row?.revision ?? 0,
        leaseToken: 'synthetic-lease',
      })
    }
    if (method === 'GET' && path === '/rest/v1/encounters') {
      return reply(
        url.searchParams.get('kind') === 'eq.saved'
          ? []
          : rows.has(user.id)
            ? [rows.get(user.id)]
            : [],
      )
    }
    if (
      method === 'GET' &&
      /^\/rest\/v1\/(campaigns|creatures|effects|players|shares|spells)$/.test(path)
    )
      return reply([])
    unexpected.push(`${method} ${path}`)
    return reply({ message: 'Unimplemented synthetic endpoint' }, 501)
  })
  await context.routeWebSocket('**/*', (socket) => socket.close())
  return {
    users,
    rows,
    calls,
    failures,
    denied,
    unexpected,
    /** Pause one real browser HTTP request until the test explicitly releases it. */
    hold(path: string) {
      let entered!: () => void
      let release!: () => void
      const started = new Promise<void>((resolve) => {
        entered = resolve
      })
      const wait = new Promise<void>((resolve) => {
        release = resolve
      })
      holds.set(path, { entered, wait })
      return { started, release }
    },
  }
}

/** Seed only the default SDK key once per tab, leaving later callback and SDK writes observable. */
async function newPage(context: BrowserContext, session?: Session) {
  const page = await context.newPage()
  if (session)
    await page.addInitScript(
      ({ storageKey, session }) => {
        if (!sessionStorage.getItem('synthetic-session-seeded')) {
          localStorage.setItem(storageKey, JSON.stringify(session))
          sessionStorage.setItem('synthetic-session-seeded', 'yes')
        }
      },
      { storageKey, session },
    )
  return page
}

/** Add a real combatant through the compiled console without installing a board fixture. */
async function quickAdd(page: Page, name: string) {
  await page.getByRole('button', { name: 'Quick add', exact: true }).click()
  await page.getByRole('textbox', { name: 'Quick add name' }).fill(name)
  await page.getByRole('textbox', { name: 'AC', exact: true }).fill('14')
  await page.getByRole('textbox', { name: 'Max HP' }).fill('27')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect.poll(() => page.getByText(name, { exact: true }).count()).toBeGreaterThan(0)
}

/** Dismiss the optional first-run invitation through its existing UI. */
async function consoleReady(page: Page) {
  await page.locator('[data-console-root]').waitFor()
  const invitation = page.getByRole('button', { name: 'Not now', exact: true })
  await invitation.waitFor({ state: 'visible', timeout: 1000 }).catch(() => {})
  if (await invitation.isVisible()) await invitation.click()
}

/** Read the untouched native SDK serialization. */
async function sdkBytes(page: Page) {
  return page.evaluate((key) => localStorage.getItem(key), storageKey)
}

/** Read the owner-scoped IndexedDB copy without changing its bytes. */
async function ownerRecovery(page: Page, ownerId: string) {
  return page.evaluate(
    (ownerId) =>
      new Promise<string | null>((resolve, reject) => {
        const request = indexedDB.open('openfray-encounter-recovery')
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const db = request.result
          const read = db.transaction('copies').objectStore('copies').get(ownerId)
          read.onerror = () => {
            db.close()
            reject(read.error)
          }
          read.onsuccess = () => {
            db.close()
            resolve(read.result?.serialized ?? null)
          }
        }
      }),
    ownerId,
  )
}

/** Replace native SDK storage and deliver an old cross-tab SIGNED_OUT through the SDK's real channel. */
async function replaceNative(page: Page, session: Session) {
  await page.evaluate(
    ({ storageKey, session }) => {
      localStorage.setItem(storageKey, JSON.stringify(session))
      const channel = new BroadcastChannel(storageKey)
      channel.postMessage({ event: 'SIGNED_OUT', session: null })
      channel.close()
    },
    { storageKey, session },
  )
}

describe.skipIf(!origin)('assembled account and console session boundary', () => {
  beforeAll(async () => {
    const target = new URL(origin!)
    if (
      target.protocol !== 'http:' ||
      !['127.0.0.1', 'localhost'].includes(target.hostname) ||
      target.pathname !== '/'
    )
      throw new Error('Use only an isolated local HTTP Pages preview origin.')
    if ((await fetchPreview(origin!, origin!)).status !== 200)
      throw new Error('Start the isolated Pages preview before running account checks.')
    browser = await chromium.launch({ headless: true })
  })
  afterAll(async () => {
    await browser?.close()
  })

  it('serves /account directly with canonical query-preserving fallback and local compiled modules', async () => {
    const response = await fetchPreview(
      `${origin}/account?returnTo=%2Fconsole%2F%3Fview%3Dboard%23round-2`,
      origin!,
    )
    expect(new URL(response.url).pathname).toBe('/account/')
    expect(new URL(response.url).search).toBe('?returnTo=%2Fconsole%2F%3Fview%3Dboard%23round-2')
    const html = await response.text()
    expect(html).toContain('data-account')
    for (const { response: module } of await fetchPreviewScripts(html, origin!)) {
      expect(module.status).toBe(200)
      expect(module.headers.get('content-type')).toMatch(/javascript/)
    }
  })

  it('checkpoints an actual working board, updates only trusted profile HTTP, and returns unchanged to console mount/focus', async () => {
    const session = syntheticSession(1)
    const context = await browser.newContext({
      viewport: { width: 1600, height: 1000 },
      serviceWorkers: 'block',
    })
    const backend = await mockBackend(context, [session])
    const page = await newPage(context, session)
    try {
      await page.goto(`${origin}/console/?view=board#round-2`)
      await consoleReady(page)
      await quickAdd(page, 'Private checkpoint sentinel')
      const held = backend.hold('/rest/v1/rpc/save_encounter_revision')
      await quickAdd(page, 'Latest departure sentinel')
      await held.started
      await page.getByRole('button', { name: 'Account menu' }).click()
      await page.getByRole('menuitem', { name: 'Profile', exact: true }).click()
      expect(new URL(page.url()).pathname).toBe('/console/')
      held.release()
      await page.waitForURL('**/account/**')
      expect(new URL(page.url()).searchParams.get('returnTo')).toBe('/console/?view=board#round-2')
      await page.waitForFunction(
        () => !document.querySelector<HTMLFieldSetElement>('fieldset')?.disabled,
      )
      const checkpoint = await ownerRecovery(page, session.user.id)
      expect(checkpoint).toContain('Latest departure sentinel')
      const board = structuredClone(backend.rows.get(session.user.id)!.state)
      expect(
        board.combatants.filter((combatant) => combatant.isPC).map((combatant) => combatant.name),
      ).toEqual(['Private checkpoint sentinel', 'Latest departure sentinel'])
      const native = await sdkBytes(page)
      await page.locator('#display-name').fill('Trusted return name')
      await page.locator('[data-account-name-form] button').click()
      await expect.poll(() => page.locator('[data-account-status]').textContent()).toBe('Saved.')
      await page.locator('#share-license-default').selectOption('cc-by-4.0')
      await expect.poll(() => page.locator('[data-account-status]').textContent()).toBe('Saved.')
      expect(await sdkBytes(page)).toBe(native)
      const beforeGet = backend.calls.filter(
        (call) => call.path === '/auth/v1/user' && call.method === 'GET',
      ).length
      await page.locator('[data-account-return]').click()
      await page.waitForURL(`${origin}/console/?view=board#round-2`)
      await consoleReady(page)
      await expect
        .poll(
          () =>
            backend.calls.filter((call) => call.path === '/auth/v1/user' && call.method === 'GET')
              .length,
        )
        .toBeGreaterThan(beforeGet)
      expect(JSON.parse((await ownerRecovery(page, session.user.id))!).payload.encounter).toEqual(
        JSON.parse(checkpoint!).payload.encounter,
      )
      expect(backend.rows.get(session.user.id)!.state).toEqual(board)
      await expect
        .poll(() => page.getByText('Latest departure sentinel', { exact: true }).count())
        .toBeGreaterThan(0)
      await page.getByRole('button', { name: 'Share this encounter', exact: true }).click()
      await expect.poll(() => page.locator('#share-by').inputValue()).toBe('Trusted return name')
      expect(await page.locator('#share-license').inputValue()).toBe('cc-by-4.0')
      const refreshed = backend.calls.length
      backend.users.get(session.access_token)!.user_metadata.display_name = 'Focus trusted name'
      await page.evaluate(() => window.dispatchEvent(new Event('focus')))
      await expect.poll(() => page.locator('#share-by').inputValue()).toBe('Focus trusted name')
      expect(
        backend.calls
          .slice(refreshed)
          .some((call) => call.path === '/auth/v1/user' && call.method === 'GET'),
      ).toBe(true)
      expect(await sdkBytes(page)).toBe(native)
      expect(backend.rows.get(session.user.id)!.state).toEqual(board)
      expect(backend.unexpected).toEqual([])
      expect(
        backend.calls
          .filter((call) => call.path.endsWith('save_encounter_revision'))
          .every((call) => call.actor === call.body?.want_owner),
      ).toBe(true)
    } finally {
      await context.close()
    }
  }, 45_000)

  it.each(['online', 'offline'] as const)(
    'takes anonymous account through signup/callback and explicit choice, retaining later owner edits on %s remount',
    async (mode) => {
      const session = syntheticSession(2)
      const context = await browser.newContext({
        viewport: { width: 1600, height: 1000 },
        serviceWorkers: 'block',
      })
      const backend = await mockBackend(context, [session])
      const page = await newPage(context)
      try {
        await page.goto(`${origin}/console/?view=board#anonymous-round`)
        await consoleReady(page)
        await quickAdd(page, 'Genuine anonymous sentinel')
        await page.getByRole('button', { name: 'Sign in', exact: true }).first().click()
        await page.waitForURL('**/sign-in/**')
        await page.goto(
          `${origin}/account/?returnTo=%2Fconsole%2F%3Fview%3Dboard%23anonymous-round`,
        )
        await page.waitForURL('**/sign-in/**')
        const accountReturn = new URL(page.url()).searchParams.get('returnTo')!
        expect(accountReturn).toContain('/account/?returnTo=')
        await page.locator('[data-auth-switch]').click()
        await page.waitForURL('**/sign-up/**')
        const handoff = page.waitForRequest((request) =>
          request.url().startsWith(`${project}/auth/v1/authorize`),
        )
        await page.locator('[data-provider="google"]').click()
        const callback = new URL(new URL((await handoff).url()).searchParams.get('redirect_to')!)
        await page.goto(`${origin}/privacy/`)
        const attempt = await page.evaluate(() =>
          JSON.parse(sessionStorage.getItem('openfray-oauth-attempt')!),
        )
        expect(attempt.returnTo).toBe(accountReturn)
        callback.hash = new URLSearchParams({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        }).toString()
        await page.goto(callback.href)
        await page.waitForURL('**/account/**')
        await page.waitForFunction(
          () => !document.querySelector<HTMLFieldSetElement>('fieldset')?.disabled,
        )
        expect(await page.locator('[data-account-identity]').textContent()).toBe(session.user.email)
        expect(
          await page.evaluate(() => sessionStorage.getItem('openfray-oauth-attempt')),
        ).toBeNull()
        expect(JSON.parse((await sdkBytes(page))!).access_token).toBe(session.access_token)
        await page.locator('[data-account-return]').click()
        await page.waitForURL(`${origin}/console/?view=board#anonymous-round`)
        await consoleReady(page)
        await expect
          .poll(() => page.getByText('Genuine anonymous sentinel', { exact: true }).count())
          .toBeGreaterThan(0)
        await page.getByRole('button', { name: 'Use device copy', exact: true }).waitFor()
        const activeAnonymous = await page.evaluate(() =>
          sessionStorage.getItem('openfray:session'),
        )
        expect(activeAnonymous).toContain('Genuine anonymous sentinel')
        await page.getByRole('button', { name: 'Use device copy', exact: true }).click()
        await page
          .getByRole('button', { name: 'Use device copy', exact: true })
          .waitFor({ state: 'hidden' })
        await quickAdd(page, 'Owner edit after explicit choice')
        await expect
          .poll(async () =>
            (await ownerRecovery(page, session.user.id))?.includes(
              'Owner edit after explicit choice',
            ),
          )
          .toBe(true)
        const recovery = await ownerRecovery(page, session.user.id)
        await expect
          .poll(() =>
            backend.rows
              .get(session.user.id)
              ?.state.combatants.some(
                (combatant) =>
                  combatant.isPC && combatant.name === 'Owner edit after explicit choice',
              ),
          )
          .toBe(true)
        const archive = await page.evaluate(
          (ownerId) =>
            new Promise<unknown>((resolve, reject) => {
              const request = indexedDB.open('openfray-encounter-recovery')
              request.onerror = () => reject(request.error)
              request.onsuccess = () => {
                const db = request.result
                const read = db.transaction('conflicts').objectStore('conflicts').get(ownerId)
                read.onerror = () => {
                  db.close()
                  reject(read.error)
                }
                read.onsuccess = () => {
                  db.close()
                  resolve(read.result)
                }
              }
            }),
          session.user.id,
        )
        expect(archive).toMatchObject({
          ownerId: session.user.id,
          unresolved: false,
          anonymous: true,
        })
        expect(JSON.stringify(archive)).toContain('Genuine anonymous sentinel')
        if (mode === 'offline') {
          backend.failures.add('/rest/v1/encounters')
          await page.addInitScript(() =>
            Object.defineProperty(navigator, 'onLine', { get: () => false }),
          )
        }
        await page.reload()
        await consoleReady(page)
        expect({
          activeAnonymous: await page.evaluate(() => sessionStorage.getItem('openfray:session')),
          previousAnonymous: await page.evaluate(() =>
            sessionStorage.getItem('openfray:session:previous'),
          ),
          ownerEditVisible:
            (await page.getByText('Owner edit after explicit choice', { exact: true }).count()) > 0,
          conflictChoices: await page
            .getByRole('button', { name: 'Use device copy', exact: true })
            .count(),
        }).toEqual({
          activeAnonymous: null,
          previousAnonymous: null,
          ownerEditVisible: true,
          conflictChoices: 0,
        })
        expect(JSON.parse((await ownerRecovery(page, session.user.id))!).payload.encounter).toEqual(
          JSON.parse(recovery!).payload.encounter,
        )
        expect(backend.denied.some((url) => url.startsWith(`${project}/auth/v1/authorize`))).toBe(
          true,
        )
        expect(backend.unexpected).toEqual([])
        expect(
          backend.calls
            .filter((call) => call.path.endsWith('save_encounter_revision'))
            .every((call) => call.actor === call.body?.want_owner),
        ).toBe(true)
      } finally {
        await context.close()
      }
    },
    45_000,
  )

  it('keeps revocation/deletion failures truthful and binds successful destructive calls to the captured bearer with no target payload', async () => {
    const session = syntheticSession(3)
    const context = await browser.newContext({ serviceWorkers: 'block' })
    const backend = await mockBackend(context, [session])
    const page = await newPage(context, session)
    try {
      await page.goto(`${origin}/account/`)
      await page.waitForFunction(
        () => !document.querySelector<HTMLFieldSetElement>('fieldset')?.disabled,
      )
      const native = await sdkBytes(page)
      backend.failures.add('/rest/v1/rpc/stop_all_live_views')
      await page.locator('[data-account-sign-out]').click()
      await expect
        .poll(() => page.locator('[data-account-status]').textContent())
        .toContain('You are still signed in')
      expect(await sdkBytes(page)).toBe(native)
      expect(backend.calls.some((call) => call.path === '/auth/v1/logout')).toBe(false)
      backend.failures.add('/functions/v1/account-delete')
      await page.locator('[data-account-confirm-email]').fill(session.user.email)
      await page.locator('[data-account-delete]').click()
      await expect
        .poll(() => page.locator('[data-account-status]').textContent())
        .toContain('could not be confirmed')
      expect(await page.locator('[data-account-confirm-email]').inputValue()).toBe(
        session.user.email,
      )
      expect(await sdkBytes(page)).toBe(native)
      backend.failures.delete('/functions/v1/account-delete')
      await page.locator('[data-account-delete]').click()
      await expect
        .poll(() => page.locator('[data-account-status]').textContent())
        .toContain('Account deleted.')
      expect(await sdkBytes(page)).toBeNull()
      for (const call of backend.calls.filter(
        (call) => call.path.endsWith('stop_all_live_views') || call.path.endsWith('account-delete'),
      )) {
        expect(call.bearer).toBe(`Bearer ${session.access_token}`)
        expect(call.actor).toBe(session.user.id)
        expect(call.body).toEqual({})
      }
      expect(backend.unexpected).toEqual([])
    } finally {
      await context.close()
    }
  }, 30_000)

  it.each(['/auth/v1/logout', '/functions/v1/account-delete'])(
    'retains a native replacement and reconciles old SIGNED_OUT during %s transport',
    async (path) => {
      const first = syntheticSession(4)
      const replacement = syntheticSession(5)
      const context = await browser.newContext({ serviceWorkers: 'block' })
      const backend = await mockBackend(context, [first, replacement])
      const page = await newPage(context, first)
      try {
        await page.goto(`${origin}/account/`)
        await page.waitForFunction(
          () => !document.querySelector<HTMLFieldSetElement>('fieldset')?.disabled,
        )
        const held = backend.hold(path)
        if (path.endsWith('account-delete')) {
          await page.locator('[data-account-confirm-email]').fill(first.user.email)
          await page.locator('[data-account-delete]').click()
        } else await page.locator('[data-account-sign-out]').click()
        await held.started
        await replaceNative(page, replacement)
        const replacementBytes = await sdkBytes(page)
        held.release()
        await expect
          .poll(() => page.locator('[data-account-identity]').textContent())
          .toBe(replacement.user.email)
        expect(await sdkBytes(page)).toBe(replacementBytes)
        expect(await page.locator('[data-account-confirm-email]').inputValue()).toBe('')
        const destructive = backend.calls.filter((call) => call.path === path)
        expect(destructive).toHaveLength(1)
        expect(destructive[0].actor).toBe(first.user.id)
        expect(destructive[0].bearer).toBe(`Bearer ${first.access_token}`)
        expect(backend.calls.some((call) => call.path.endsWith('save_encounter_revision'))).toBe(
          false,
        )
        expect(backend.unexpected).toEqual([])
      } finally {
        await context.close()
      }
    },
    30_000,
  )

  it('fences old SIGNED_OUT and an in-flight owner save from publishing a private board under a native replacement', async () => {
    const first = syntheticSession(8)
    const replacement = syntheticSession(9)
    const context = await browser.newContext({
      viewport: { width: 1600, height: 1000 },
      serviceWorkers: 'block',
    })
    const backend = await mockBackend(context, [first, replacement])
    const page = await newPage(context, first)
    try {
      await page.goto(`${origin}/console/`)
      await consoleReady(page)
      await quickAdd(page, 'First owner private sentinel')
      await expect.poll(() => backend.rows.get(first.user.id)?.state.combatants.length).toBe(1)
      const held = backend.hold('/rest/v1/rpc/save_encounter_revision')
      await quickAdd(page, 'First owner in-flight edit')
      await held.started
      await expect
        .poll(async () =>
          (await ownerRecovery(page, first.user.id))?.includes('First owner in-flight edit'),
        )
        .toBe(true)
      const retained = await ownerRecovery(page, first.user.id)
      await replaceNative(page, replacement)
      await expect
        .poll(() => page.getByRole('button', { name: 'Account menu' }).getAttribute('title'))
        .toBe(replacement.user.email)
      held.release()
      await expect
        .poll(() => page.getByText('First owner private sentinel', { exact: true }).count())
        .toBe(0)
      await quickAdd(page, 'Replacement owner genuine edit')
      await expect
        .poll(() => backend.rows.get(replacement.user.id)?.state.combatants.length)
        .toBe(1)
      expect(
        backend.rows
          .get(replacement.user.id)!
          .state.combatants.filter((combatant) => combatant.isPC)
          .map((combatant) => combatant.name),
      ).toEqual(['Replacement owner genuine edit'])
      expect(await ownerRecovery(page, first.user.id)).toBe(retained)
      const writes = backend.calls.filter((call) => call.path.endsWith('save_encounter_revision'))
      expect(writes.some((call) => call.actor === first.user.id)).toBe(true)
      expect(writes.some((call) => call.actor === replacement.user.id)).toBe(true)
      expect(writes.every((call) => call.actor === call.body?.want_owner)).toBe(true)
      expect(
        writes
          .filter((call) => call.actor === replacement.user.id)
          .every((call) => !JSON.stringify(call.body?.want_state).includes('First owner')),
      ).toBe(true)
      expect(backend.unexpected).toEqual([])
    } finally {
      await context.close()
    }
  }, 30_000)

  it.each(['blocked', 'missing'] as const)(
    'does not restore a private owner mirror as anonymous with %s IndexedDB and retains genuine new anonymous edits',
    async (mode) => {
      const session = syntheticSession(6)
      const context = await browser.newContext({
        viewport: { width: 1600, height: 1000 },
        serviceWorkers: 'block',
      })
      const backend = await mockBackend(context, [session])
      const page = await newPage(context, session)
      try {
        await page.goto(`${origin}/console/`)
        await consoleReady(page)
        await quickAdd(page, 'Owner-only private sentinel')
        await page.getByRole('button', { name: 'Account menu' }).click()
        await page.getByRole('menuitem', { name: 'Profile', exact: true }).click()
        await page.waitForURL('**/account/**')
        await page.waitForFunction(
          () => !document.querySelector<HTMLFieldSetElement>('fieldset')?.disabled,
        )
        const retained = await ownerRecovery(page, session.user.id)
        expect(retained).toContain('Owner-only private sentinel')
        const ownerMirror = await page.evaluate(() =>
          sessionStorage.getItem('openfray:session:owner'),
        )
        expect(ownerMirror).toContain('Owner-only private sentinel')
        await page.locator('[data-account-sign-out]').click()
        await expect
          .poll(() => page.locator('[data-account-status]').textContent())
          .toBe('Signed out.')
        expect(await sdkBytes(page)).toBeNull()
        expect(await ownerRecovery(page, session.user.id)).toBe(retained)
        if (mode === 'missing')
          await page.evaluate(
            () =>
              new Promise<void>((resolve, reject) => {
                const request = indexedDB.deleteDatabase('openfray-encounter-recovery')
                request.onsuccess = () => resolve()
                request.onerror = () => reject(request.error)
                request.onblocked = () => reject(new Error('Recovery database deletion blocked'))
              }),
          )
        else
          await page.addInitScript(() => {
            Object.defineProperty(window, 'indexedDB', {
              get() {
                throw new DOMException('Synthetic storage blocked', 'SecurityError')
              },
            })
          })
        const beforeReturn = backend.calls.length
        await page.locator('[data-account-return]').click()
        await page.waitForURL(`${origin}/console/`)
        await consoleReady(page)
        expect(await page.getByText('Owner-only private sentinel', { exact: true }).count()).toBe(0)
        await quickAdd(page, 'New anonymous retained sentinel')
        await page.reload()
        await consoleReady(page)
        await expect
          .poll(() => page.getByText('New anonymous retained sentinel', { exact: true }).count())
          .toBeGreaterThan(0)
        expect(await page.getByText('Owner-only private sentinel', { exact: true }).count()).toBe(0)
        expect(await page.evaluate(() => sessionStorage.getItem('openfray:session:owner'))).toBe(
          ownerMirror,
        )
        expect(
          backend.calls
            .slice(beforeReturn)
            .filter((call) => call.path.endsWith('save_encounter_revision')),
        ).toEqual([])
        expect(backend.unexpected).toEqual([])
      } finally {
        await context.close()
      }
    },
    45_000,
  )
})
