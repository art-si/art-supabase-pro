import { access, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from '@playwright/test'

const args = process.argv.slice(2)

function option(name, fallback = '') {
  const flag = `--${name}`
  const inlinePrefix = `${flag}=`
  const inline = args.find((value) => value.startsWith(inlinePrefix))
  if (inline) return inline.slice(inlinePrefix.length)

  const index = args.indexOf(flag)
  if (index >= 0 && args[index + 1] && !args[index + 1].startsWith('--')) {
    return args[index + 1]
  }

  return fallback
}

function printUsage() {
  console.log(`Usage:
  pnpm.cmd exec node .agents/skills/professional-ui-quality/scripts/visual-audit.mjs \\
    --url "http://127.0.0.1:3006/#/route" \\
    [--selector ".page-root"] \\
    [--viewports "1440x900,1280x800"] \\
    [--themes "current,light,dark"] \\
    [--box-modes "current,border-mode,shadow-mode"] \\
    [--storage-state "playwright/.auth/user.json"] \\
    [--output ".artifacts/ui-quality"] \\
    [--browser-executable "C:\\path\\to\\chrome.exe"] \\
    [--timeout "30000"] [--settle "500"]`)
}

if (args.includes('--help')) {
  printUsage()
  process.exit(0)
}

const url = option('url')
if (!url) {
  printUsage()
  throw new Error('Missing required --url option.')
}

const selector = option('selector', 'body')
const outputDirectory = path.resolve(option('output', '.artifacts/ui-quality'))
const timeout = Number(option('timeout', '30000'))
const settle = Number(option('settle', '500'))
const storageStatePath = option('storage-state')
const browserExecutable = option('browser-executable')

function parseList(value) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function parseViewports(value) {
  return parseList(value).map((item) => {
    const match = /^(\d+)x(\d+)$/.exec(item)
    if (!match) throw new Error(`Invalid viewport "${item}". Use WIDTHxHEIGHT.`)

    return { width: Number(match[1]), height: Number(match[2]) }
  })
}

function safeName(value) {
  return value.replaceAll(/[^a-zA-Z0-9_-]+/g, '-').replaceAll(/^-+|-+$/g, '') || 'current'
}

const viewports = parseViewports(option('viewports', '1440x900,1280x800'))
const themes = parseList(option('themes', 'current'))
const boxModes = parseList(option('box-modes', 'current'))

const allowedThemes = new Set(['current', 'light', 'dark'])
const allowedBoxModes = new Set(['current', 'border-mode', 'shadow-mode'])

if (themes.some((theme) => !allowedThemes.has(theme))) {
  throw new Error('Themes must be current, light, or dark.')
}
if (boxModes.some((mode) => !allowedBoxModes.has(mode))) {
  throw new Error('Box modes must be current, border-mode, or shadow-mode.')
}
if (!Number.isFinite(timeout) || timeout <= 0 || !Number.isFinite(settle) || settle < 0) {
  throw new Error('Timeout must be positive and settle must be non-negative.')
}

if (storageStatePath) await access(path.resolve(storageStatePath))
await mkdir(outputDirectory, { recursive: true })

async function launchBrowser() {
  if (browserExecutable) {
    return chromium.launch({ headless: true, executablePath: browserExecutable })
  }

  try {
    return await chromium.launch({ headless: true, channel: 'chrome' })
  } catch (channelError) {
    try {
      return await chromium.launch({ headless: true })
    } catch (bundledError) {
      throw new AggregateError(
        [channelError, bundledError],
        'Unable to launch Chrome or the bundled Playwright browser. Install a Playwright browser or pass --browser-executable.',
        { cause: bundledError }
      )
    }
  }
}

function variantName(viewport, theme, boxMode) {
  return `${viewport.width}x${viewport.height}-${safeName(theme)}-${safeName(boxMode)}`
}

const browser = await launchBrowser()
const results = []

try {
  for (const viewport of viewports) {
    for (const theme of themes) {
      for (const boxMode of boxModes) {
        const consoleErrors = []
        const pageErrors = []
        const context = await browser.newContext({
          viewport,
          deviceScaleFactor: 1,
          ...(storageStatePath ? { storageState: path.resolve(storageStatePath) } : {})
        })
        const page = await context.newPage()

        page.on('console', (message) => {
          if (message.type() === 'error') consoleErrors.push(message.text())
        })
        page.on('pageerror', (error) => pageErrors.push(error.message))

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout })
        await page
          .waitForLoadState('networkidle', { timeout: Math.min(timeout, 5000) })
          .catch(() => {})

        const target = page.locator(selector).first()
        await target.waitFor({ state: 'visible', timeout })
        const settingGuide = page.locator('.setting-guide').first()
        if (await settingGuide.isVisible()) {
          const dismissButton = settingGuide.getByRole('button').last()
          if (await dismissButton.isVisible()) {
            await dismissButton.click()
            await settingGuide
              .waitFor({ state: 'hidden', timeout: Math.min(timeout, 5000) })
              .catch(() => {})
          }
        }
        await target
          .locator('[aria-busy="true"]')
          .first()
          .waitFor({ state: 'hidden', timeout: Math.min(timeout, 15000) })
          .catch(() => {})
        await page
          .locator('.el-loading-mask:visible')
          .first()
          .waitFor({ state: 'hidden', timeout: Math.min(timeout, 15000) })
          .catch(() => {})
        if (settle > 0) await page.waitForTimeout(settle)

        await page.evaluate(
          ({ selectedTheme, selectedBoxMode }) => {
            if (selectedTheme !== 'current') {
              document.documentElement.classList.toggle('dark', selectedTheme === 'dark')
            }
            if (selectedBoxMode !== 'current') {
              document.documentElement.setAttribute('data-box-mode', selectedBoxMode)
            }
          },
          { selectedTheme: theme, selectedBoxMode: boxMode }
        )
        await page.evaluate(
          () =>
            new Promise((resolve) => {
              requestAnimationFrame(() => requestAnimationFrame(resolve))
            })
        )

        const metrics = await page.evaluate((targetSelector) => {
          const scope = document.querySelector(targetSelector)
          const root = document.documentElement
          const focusableSelector = [
            'a[href]',
            'button:not([disabled])',
            'input:not([disabled])',
            'select:not([disabled])',
            'textarea:not([disabled])',
            '[tabindex]:not([tabindex="-1"])'
          ].join(',')
          const focusables = scope ? [...scope.querySelectorAll(focusableSelector)] : []

          const accessibleName = (element) => {
            const labelledBy = element.getAttribute('aria-labelledby')
            const labelledText = labelledBy
              ? labelledBy
                  .split(/\s+/)
                  .map((id) => document.getElementById(id)?.textContent?.trim() || '')
                  .join(' ')
                  .trim()
              : ''
            const labels =
              'labels' in element && element.labels
                ? [...element.labels]
                    .map((label) => label.textContent?.trim() || '')
                    .join(' ')
                    .trim()
                : ''

            return (
              element.getAttribute('aria-label')?.trim() ||
              labelledText ||
              labels ||
              element.getAttribute('title')?.trim() ||
              element.getAttribute('alt')?.trim() ||
              element.textContent?.trim() ||
              ''
            )
          }

          const visibleFocusables = focusables.filter((element) => {
            const rect = element.getBoundingClientRect()
            const style = getComputedStyle(element)
            return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden'
          })

          const unnamed = visibleFocusables.filter((element) => !accessibleName(element))
          const undersized = visibleFocusables.filter((element) => {
            const rect = element.getBoundingClientRect()
            return rect.width < 24 || rect.height < 24
          })

          return {
            appliedTheme: root.classList.contains('dark') ? 'dark' : 'light',
            appliedBoxMode: root.getAttribute('data-box-mode') || 'unset',
            documentWidth: root.clientWidth,
            documentScrollWidth: root.scrollWidth,
            horizontalOverflow: root.scrollWidth > root.clientWidth + 1,
            busyRegionCount: scope?.querySelectorAll('[aria-busy="true"]').length ?? 0,
            visibleSkeletonCount: scope
              ? [...scope.querySelectorAll('.el-skeleton')].filter((element) => {
                  const rect = element.getBoundingClientRect()
                  const style = getComputedStyle(element)
                  return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden'
                }).length
              : 0,
            focusableCount: visibleFocusables.length,
            unnamedInteractiveCount: unnamed.length,
            undersizedInteractiveCount: undersized.length,
            unnamedInteractive: unnamed
              .slice(0, 20)
              .map((element) => element.outerHTML.slice(0, 240)),
            undersizedInteractive: undersized.slice(0, 20).map((element) => {
              const rect = element.getBoundingClientRect()
              return {
                width: Math.round(rect.width * 10) / 10,
                height: Math.round(rect.height * 10) / 10,
                html: element.outerHTML.slice(0, 200)
              }
            })
          }
        }, selector)

        const name = variantName(viewport, theme, boxMode)
        const fullPageScreenshot = path.join(outputDirectory, `${name}-full.png`)
        const targetScreenshot = path.join(outputDirectory, `${name}-target.png`)

        await page.screenshot({ path: fullPageScreenshot, fullPage: true, animations: 'disabled' })
        await target.screenshot({ path: targetScreenshot, animations: 'disabled' })

        results.push({
          name,
          url: page.url(),
          viewport,
          theme,
          boxMode,
          selector,
          screenshots: {
            fullPage: path.relative(process.cwd(), fullPageScreenshot).replaceAll('\\', '/'),
            target: path.relative(process.cwd(), targetScreenshot).replaceAll('\\', '/')
          },
          metrics,
          consoleErrors,
          pageErrors
        })

        await context.close()
      }
    }
  }
} finally {
  await browser.close()
}

const blockingFindings = results.flatMap((result) => {
  const findings = []
  if (result.metrics.horizontalOverflow) findings.push(`${result.name}: horizontal overflow`)
  if (result.metrics.busyRegionCount || result.metrics.visibleSkeletonCount) {
    findings.push(`${result.name}: page captured before loading completed`)
  }
  if (result.theme !== 'current' && result.metrics.appliedTheme !== result.theme) {
    findings.push(`${result.name}: requested theme was not applied`)
  }
  if (result.boxMode !== 'current' && result.metrics.appliedBoxMode !== result.boxMode) {
    findings.push(`${result.name}: requested box mode was not applied`)
  }
  if (result.consoleErrors.length)
    findings.push(`${result.name}: ${result.consoleErrors.length} console error(s)`)
  if (result.pageErrors.length)
    findings.push(`${result.name}: ${result.pageErrors.length} page error(s)`)
  return findings
})

const report = {
  generatedAt: new Date().toISOString(),
  status: blockingFindings.length ? 'failed' : 'passed',
  blockingFindings,
  advisory:
    'Unnamed and undersized interaction counts require manual review; composite widgets and intentionally expanded hit areas may be valid.',
  results
}

const reportPath = path.join(outputDirectory, 'visual-audit.json')
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

console.log(`Visual audit ${report.status}: ${results.length} variant(s).`)
console.log(`Report: ${path.relative(process.cwd(), reportPath).replaceAll('\\', '/')}`)
blockingFindings.forEach((finding) => console.error(`- ${finding}`))

if (blockingFindings.length) process.exitCode = 1
