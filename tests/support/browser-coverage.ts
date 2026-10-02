import { mkdir, writeFile } from 'node:fs/promises'
import type { Page } from 'playwright'

export async function captureBrowserCoverage(page: Page, name: string): Promise<void> {
  const coverage = await page.evaluate(() => {
    return (globalThis as typeof globalThis & { __coverage__?: unknown }).__coverage__
  })

  if (!coverage || typeof coverage !== 'object' || Object.keys(coverage).length === 0) {
    const scriptElements = await page.locator('script[src]').all()
    const scripts = await Promise.all(scriptElements.map((script) => script.getAttribute('src')))
    throw new Error(
      `Browser coverage is missing. Set VITE_COVERAGE=true. Loaded scripts: ${JSON.stringify(scripts)}`
    )
  }

  await mkdir('coverage/browser/raw', { recursive: true })
  await writeFile(`coverage/browser/raw/${name}.json`, JSON.stringify(coverage))
}
