import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(300_000)

const governanceDetail = {
  id: 'governance-test',
  hazardNo: 'HAZ-GOV-001',
  sourceType: 'inspection',
  description: '隐患治理身份栏布局测试',
  location: '三号车间',
  hazardLevel: 'general',
  status: 'pending_approval',
  reporterEmployeeId: 'employee-test',
  reporterEmployeeNo: 'EMP-001',
  reporterEmployeeName: '测试上报人',
  reportedAt: '2026-10-01T08:00:00Z',
  imageUrls: [],
  rectificationImageUrls: [],
  acceptanceImageUrls: [],
  events: [],
  createTime: '2026-10-01T08:00:00Z',
  updateTime: '2026-10-01T08:00:00Z'
}

for (const scenario of [
  { kind: 'ledger', identity: '.hazard-ledger-detail__identity', title: '隐患治理详情' },
  { kind: 'risk', identity: '.risk-information-detail__identity', title: '风险管控详情' },
  { kind: 'governance', identity: '.hazard-governance-detail__identity', title: '隐患详情' }
]) {
  test(`${scenario.kind} 身份栏明暗主题与窄屏布局`, async ({ page }, info) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
    await page.route('**/rest/v1/rpc/smis_get_hidden_hazard_governance_secure', (route) =>
      route.fulfill({ json: governanceDetail })
    )
    await page.goto(
      `/tests/e2e/fixtures/smis-dual-control-detail-style.html?kind=${scenario.kind}`,
      {
        waitUntil: 'commit',
        timeout: 180_000
      }
    )
    const open = page.getByRole('button', { name: '打开双重预防详情', exact: true })
    await expect(open).toBeVisible({ timeout: 120_000 })
    await open.click()
    const drawer = page.locator('.el-drawer:visible')
    await expect(drawer).toContainText(scenario.title)
    const identity = drawer.locator(scenario.identity)
    await expect(identity).toBeVisible()
    await expect(identity.locator(':scope > span:first-child')).toHaveCSS('width', '48px')
    await expect(identity.locator(':scope > span:first-child')).toHaveCSS('height', '48px')
    await expect(identity).toHaveCSS('border-left-width', '3px')
    await page.screenshot({ path: info.outputPath(`${scenario.kind}-light-1440.png`) })

    await page.setViewportSize({ width: 570, height: 900 })
    await page.evaluate(() => document.documentElement.classList.add('dark'))
    await expect(identity).toBeVisible()
    expect(
      await identity.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
    ).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true
    )
    expect(errors).toEqual([])
    await page.screenshot({ path: info.outputPath(`${scenario.kind}-dark-570.png`) })
  })
}
