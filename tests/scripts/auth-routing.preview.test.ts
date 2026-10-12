// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

import { chromium, type Browser, type BrowserContext } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fetchPreview, fetchPreviewScripts } from './preview-http'

const origin = process.env.OPENFRAY_PAGES_ORIGIN
const routes = ['/sign-in/', '/sign-up/', '/auth/callback/']
let browser: Browser
let context: BrowserContext

describe.skipIf(!origin)('assembled Pages auth routing', () => {
  beforeAll(async () => {
    const target = new URL(origin!)
    if (
      target.protocol !== 'http:' ||
      !['127.0.0.1', 'localhost'].includes(target.hostname) ||
      target.pathname !== '/'
    ) {
      throw new Error('Use only an isolated local HTTP Pages preview origin.')
    }
    browser = await chromium.launch({ headless: true })
    context = await browser.newContext()
    await context.route('**/*', (route) =>
      new URL(route.request().url()).origin === target.origin ? route.continue() : route.abort(),
    )
  })
  afterAll(async () => {
    await browser?.close()
  })

  it('serves direct visits, canonical redirects, queries, reload requests, and actual JavaScript', async () => {
    for (const path of routes) {
      const query =
        path === '/auth/callback/'
          ? '?attempt=mock-attempt-0123456789'
          : '?returnTo=%2Fconsole%2F%3Fview%3Dboard%23round-2'
      const response = await fetchPreview(`${origin}${path.slice(0, -1)}${query}`, origin!)
      expect(response.status).toBe(200)
      expect(new URL(response.url).pathname).toBe(path)
      expect(new URL(response.url).search).toBe(query)
      const html = await response.text()
      expect(html).toContain(path === '/auth/callback/' ? 'data-auth-callback' : 'data-auth-entry')
      expect(response.headers.get('content-security-policy')).toContain(
        "script-src 'self' 'unsafe-inline'",
      )
      expect(response.headers.get('content-security-policy')).toContain(
        'https://abcdefghijklmnopqrst.supabase.co',
      )
      expect(response.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin')
      expect(response.headers.get('cache-control') || '').not.toContain('immutable')
      const reload = await fetchPreview(response.url, origin!)
      expect(reload.status).toBe(200)
      expect(await reload.text()).toBe(html)
      const scripts = await fetchPreviewScripts(html, origin!)
      for (const { url, response: asset } of scripts) {
        expect(asset.status).toBe(200)
        expect(asset.headers.get('content-type')).toMatch(/javascript/)
        expect(await asset.text()).not.toMatch(/^\s*<!doctype html/i)
        if (url.pathname.startsWith('/_astro/'))
          expect(asset.headers.get('cache-control')).toContain('immutable')
      }
      if (path === '/auth/callback/') {
        expect(html).toContain('name="referrer" content="no-referrer"')
        expect(html).not.toMatch(/cloudflareinsights|usefathom/)
      }
    }
  })

  it('executes entry modules after reload without losing the validated query and fragment destination', async () => {
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    for (const path of routes.slice(0, 2)) {
      const address = `${origin}${path}?returnTo=%2Fconsole%2F%3Fview%3Dboard%23round-2`
      await page.goto(address)
      await page.waitForFunction(
        () =>
          document.querySelector('[data-auth-cancel]')?.getAttribute('href') ===
          '/console/?view=board#round-2',
      )
      await page.reload()
      await page.waitForFunction(
        () =>
          document.querySelector('[data-auth-cancel]')?.getAttribute('href') ===
          '/console/?view=board#round-2',
      )
      expect(page.url()).toBe(address)
      expect(await page.locator('[data-provider]').count()).toBe(3)
      expect(await page.locator('input[type=checkbox]').count()).toBe(0)
      expect(await page.evaluate(() => navigator.serviceWorker.controller)).toBeNull()
    }
    expect(errors).toEqual([])
    await page.close()
  })

  it('builds a provider handoff for the mock deployment project with an attempt-scoped same-origin callback', async () => {
    const page = await context.newPage()
    await page.goto(`${origin}/sign-in/?returnTo=%2Fconsole%2F%3Fview%3Dboard%23round-2`)
    await page.waitForFunction(
      () =>
        document.querySelector('[data-auth-cancel]')?.getAttribute('href') ===
        '/console/?view=board#round-2',
    )
    const request = page.waitForRequest((request) =>
      request.url().startsWith('https://abcdefghijklmnopqrst.supabase.co/auth/v1/authorize'),
    )
    await page.locator('[data-provider="google"]').click()
    const handoff = new URL((await request).url())
    expect(handoff.searchParams.get('provider')).toBe('google')
    const callback = new URL(handoff.searchParams.get('redirect_to')!)
    expect(callback.origin).toBe(origin)
    expect(callback.pathname).toBe('/auth/callback/')
    expect([...callback.searchParams.keys()]).toEqual(['attempt'])
    expect(callback.searchParams.get('attempt')).toMatch(/^[\w-]{20,}$/)
    expect(callback.hash).toBe('')
    await page.close()
  })

  it('delivers callback query material to its scrubber, fails unmatched attempts, and keeps auth outside the console worker', async () => {
    const page = await context.newPage()
    await page.goto(`${origin}/console/`)
    const scope = await page.evaluate(
      async () =>
        (await navigator.serviceWorker.register('/console/sw.js', { scope: '/console/' })).scope,
    )
    expect(scope).toBe(`${origin}/console/`)
    await page.goto(`${origin}/auth/callback/?attempt=mock-attempt-0123456789#error=access_denied`)
    await page.waitForFunction(
      () => location.pathname === '/auth/callback/' && !location.search && !location.hash,
    )
    await page.waitForFunction(() =>
      document.querySelector('[data-auth-status]')?.textContent?.includes('Try signing in again'),
    )
    expect(await page.evaluate(() => navigator.serviceWorker.controller)).toBeNull()
    expect(
      await page.evaluate(async () =>
        Boolean(await navigator.serviceWorker.getRegistration(location.href)),
      ),
    ).toBe(false)
    await page.reload()
    expect(page.url()).toBe(`${origin}/auth/callback/`)
    expect(await page.locator('[data-auth-retry]').getAttribute('href')).toBe('/sign-in/')
    await page.close()
  }, 30_000)
})
