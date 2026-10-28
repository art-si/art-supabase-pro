import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { assertAppearance, prepareAppearance } from './support/appearance'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

const evidenceDir = join(process.cwd(), '.artifacts', 'quality-audit', 'scss-identity-icon-browser')
const modes = ['plan', 'tracking', 'standard', 'qualification', 'operation', 'master'] as const
type Mode = (typeof modes)[number]
const selectors: Record<Mode, string[]> = {
  plan: ['.hidden-hazard-plan-page__type-mark', '.hidden-hazard-plan-page__scope > span'],
  tracking: ['.hazard-governance-page__type-mark', '.hazard-governance-page__scope > span'],
  standard: ['.inspection-standard-page__scope-icon'],
  qualification: ['.qualification-catalog-navigator__all > span:first-child'],
  operation: ['.operation-type-navigator__icon', '.operation-type-navigator__marker'],
  master: ['.master-group-panel__all > span:first-child']
}

async function mockPageReads(page: Page) {
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.route('**/rest/v1/rpc/smis_list_hidden_hazard_plan_options_secure', (route) =>
    route.fulfill({
      json: {
        inspectionTypes: [
          { id: 'type-1', typeCode: 'TYPE-001', typeName: '日常排查', textColor: '#b86b10' }
        ],
        organizations: []
      }
    })
  )
  await page.route('**/rest/v1/rpc/smis_list_sites_secure', (route) => route.fulfill({ json: [] }))
  for (const rpc of [
    'smis_list_hidden_hazard_inspection_plans_secure',
    'smis_list_hidden_hazard_governance_secure'
  ])
    await page.route(`**/rest/v1/rpc/${rpc}`, (route) =>
      route.fulfill({ json: { records: [], total: 0, overview: {} } })
    )
  await page.route('**/rest/v1/smis_inspection_standard?*', (route) =>
    route.fulfill({
      json: [
        {
          id: 'standard-1',
          tenant_id: '11111111-1111-4111-8111-111111111111',
          parent_id: null,
          standard_code: 'STANDARD-001',
          standard_name: '常规排查标准',
          sort: 1,
          text_color: null,
          tag_style: 'primary',
          status: 'enabled',
          create_time: '2026-10-28T00:00:00Z',
          update_time: '2026-10-28T00:00:00Z'
        }
      ],
      headers: { 'content-range': '0-0/1' }
    })
  )
}

async function expectIconBoxes(page: Page, mode: Mode) {
  for (const selector of selectors[mode]) {
    const icon = page.locator(selector).first()
    await expect(icon).toBeVisible()
    const geometry = await icon.evaluate((element) => {
      const bounds = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return {
        width: Math.round(bounds.width),
        height: Math.round(bounds.height),
        display: style.display,
        justifyItems: style.justifyItems,
        alignItems: style.alignItems,
        background: style.backgroundColor,
        radius: style.borderRadius
      }
    })
    expect(geometry).toMatchObject({
      width: 36,
      height: 36,
      display: 'grid',
      justifyItems: 'center',
      alignItems: 'center'
    })
    expect(geometry.background).not.toBe('rgba(0, 0, 0, 0)')
    expect(geometry.radius).not.toBe('0px')
  }
}

for (const scenario of [
  {
    name: 'light-border-1440',
    width: 1440,
    appearance: { theme: 'light' as const, boxBorderMode: true }
  },
  {
    name: 'dark-shadow-700',
    width: 700,
    appearance: { theme: 'dark' as const, boxBorderMode: false }
  },
  {
    name: 'light-shadow-570',
    width: 570,
    appearance: { theme: 'light' as const, boxBorderMode: false }
  }
]) {
  test(`八处图标框与导航交互 ${scenario.name}`, async ({ page }) => {
    await page.setViewportSize({ width: scenario.width, height: 900 })
    await prepareIsolatedSession(page)
    await prepareAppearance(page, scenario.appearance)
    await mockPageReads(page)
    await mkdir(evidenceDir, { recursive: true })
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))

    for (const mode of modes) {
      const url =
        mode === 'master'
          ? '/tests/e2e/fixtures/master-group-reuse.html?mode=panel'
          : `/tests/e2e/fixtures/smis-identity-icon-reuse.html?mode=${mode}`
      await page.goto(url, { waitUntil: 'domcontentloaded' })
      await assertAppearance(page, scenario.appearance)
      if (mode === 'master' && scenario.width <= 900)
        await page.getByRole('button', { name: '展开分组' }).click()
      await expectIconBoxes(page, mode)
      if (mode === 'plan' || mode === 'tracking') {
        const root = mode === 'plan' ? '.hidden-hazard-plan-page' : '.hazard-governance-page'
        const typeButton = page.locator(`${root}__navigator button`).filter({ hasText: '日常排查' })
        await typeButton.focus()
        await page.keyboard.press('Enter')
        await expect(typeButton).toHaveClass(/is-active/)
      } else if (mode === 'qualification') {
        await page.getByText('特种作业项目', { exact: true }).click()
        await expect(page.locator('.qualification-catalog-navigator__all')).not.toHaveClass(
          /is-current/
        )
      } else if (mode === 'operation') {
        const enabled = page.getByRole('button', { name: /动火作业/ })
        await enabled.focus()
        await page.keyboard.press('Enter')
        await expect(enabled).toHaveClass(/is-current/)
        await expect(page.getByRole('button', { name: /已作废类型/ })).toBeDisabled()
      } else if (mode === 'master') {
        const group = page
          .locator('.master-group-panel__node')
          .filter({ hasText: '测试分组 0' })
          .first()
        await group.click()
        await expect(page.locator('.master-group-panel__all')).not.toHaveClass(/is-current/)
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)
      ).toBe(true)
      await page.screenshot({
        path: join(evidenceDir, `${mode}-${scenario.name}.png`),
        fullPage: true
      })
    }
    expect(pageErrors).toEqual([])
  })
}
