import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
const profiles = [
  { theme: 'light', width: 1440, height: 1000 },
  { theme: 'dark', width: 390, height: 844 }
] as const
const cases = [
  {
    entry: 'assembly',
    title: '组装单详情',
    panes: [
      ['组装信息', '组装只读核对说明'],
      ['来源组件', '验收铝板组件'],
      ['成品入库', '验收成品墙板']
    ]
  },
  {
    entry: 'issue',
    title: '领料申请详情',
    panes: [
      ['申请信息', '领料只读核对说明'],
      ['申请明细', '验收领料组件'],
      ['出库核销记录', 'ISSUE-BATCH-READ-001']
    ]
  },
  {
    entry: 'transfer',
    title: '直接调拨单',
    panes: [
      ['调拨信息', '验收目标仓库 · 仓库直存'],
      ['调拨序列号', 'SERIAL-READ-002']
    ]
  }
] as const
for (const profile of profiles)
  for (const scenario of cases) {
    test(`${scenario.entry} 全部分组只读、重开复位 ${profile.theme}${profile.width}`, async ({
      page
    }, testInfo) => {
      await page.setViewportSize({ width: profile.width, height: profile.height })
      const errors: string[] = []
      const writes: string[] = []
      const reads: string[] = []
      page.on('pageerror', (e) => errors.push(e.message))
      await page.route('**/rest/v1/**', async (route) => {
        const request = route.request()
        const url = new URL(request.url())
        const endpoint = url.pathname.split('/rest/v1/')[1]
        if (request.method() !== 'GET' && endpoint !== 'rpc/wms_issue_request_lines_secure') {
          writes.push(`${request.method()} ${endpoint}`)
          return route.fulfill({ status: 400, json: { message: '只读验收禁止写入' } })
        }
        reads.push(endpoint)
        if (endpoint === 'wms_assembly_component')
          return route.fulfill({
            json: [
              {
                id: 'component-1',
                assembly_id: 'assembly-readonly',
                source_batch_id: 'source-1',
                material_id: 'mat-1',
                quantity: 2,
                area_sqm: 6,
                unit_cost: 30,
                movement_id: 'movement-1',
                material: { material_code: 'AL-READ-001', material_name: '验收铝板组件' },
                sourceBatch: {
                  batch_no: 'ASM-SOURCE-READ-001',
                  bin: { bin_code: 'BIN-AL', bin_name: '铝板库位' }
                }
              },
              {
                id: 'component-2',
                assembly_id: 'assembly-readonly',
                source_batch_id: 'source-2',
                material_id: 'mat-2',
                quantity: 4,
                area_sqm: 6,
                unit_cost: 60,
                movement_id: 'movement-2',
                material: { material_code: 'CORE-READ-001', material_name: '验收芯材组件' },
                sourceBatch: { batch_no: 'ASM-SOURCE-READ-002' }
              }
            ]
          })
        if (endpoint === 'rpc/wms_issue_request_lines_secure') {
          expect(request.postDataJSON()).toEqual({ p_request_ids: ['issue-readonly'] })
          return route.fulfill({
            json: [
              {
                id: 'issue-line-1',
                requestId: 'issue-readonly',
                materialId: 'issue-material',
                lineNo: 1,
                requestedQuantity: 5,
                issuedQuantity: 5,
                material: {
                  materialCode: 'ISSUE-MAT-001',
                  materialName: '验收领料组件',
                  serialManagementEnabled: false,
                  baseUnit: { unitName: '件' }
                }
              }
            ]
          })
        }
        if (endpoint === 'wms_issue_request_allocation')
          return route.fulfill({
            json: [
              {
                id: 'allocation-1',
                request_id: 'issue-readonly',
                request_line_id: 'issue-line-1',
                movement_id: 'issue-movement',
                batch_id: 'issue-batch',
                quantity: 5,
                serial_ids: ['sn-1'],
                created_at: '2026-10-05T03:00:00Z',
                batch: { batch_no: 'ISSUE-BATCH-READ-001' },
                movement: { reference_no: 'ISSUE-READ-001', occurred_at: '2026-10-05T03:00:00Z' }
              }
            ]
          })
        return route.fulfill({ json: [] })
      })
      await page.goto(
        `/tests/e2e/fixtures/form-standard-wms-readonly-followup.html?entry=${scenario.entry}&theme=${profile.theme}`
      )
      const open = page.getByRole('button', { name: '打开真实只读详情', exact: true })
      await open.click()
      const drawer = page.getByRole('dialog', { name: scenario.title, exact: true })
      await expect(drawer).toBeVisible()
      await expect(drawer.getByRole('tab')).toHaveCount(scenario.panes.length)
      await expect(drawer.locator('.el-tab-pane')).toHaveCount(scenario.panes.length)
      for (const [label, value] of scenario.panes) {
        const tab = drawer.getByRole('tab', { name: label, exact: true })
        await tab.scrollIntoViewIfNeeded()
        await tab.click()
        await expect(tab).toHaveAttribute('aria-selected', 'true')
        const field = drawer.getByText(value, { exact: true }).first()
        await field.scrollIntoViewIfNeeded()
        await expect(field).toBeVisible()
        await expect(
          drawer.locator('input:not([type=hidden]),textarea,[contenteditable=true]')
        ).toHaveCount(0)
        await expect(drawer.getByRole('button', { name: /^(确定|保存|办理领料)$/ })).toHaveCount(0)
        expect(await drawer.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
        await page.screenshot({
          path: testInfo.outputPath(`${scenario.entry}-${label}-${profile.theme}.png`),
          fullPage: true,
          animations: 'disabled'
        })
      }
      await drawer.getByRole('button', { name: '关闭抽屉', exact: true }).click()
      await expect(drawer).not.toBeVisible()
      await open.click()
      await expect(drawer.getByRole('tab').first()).toHaveAttribute('aria-selected', 'true')
      await expect(drawer.getByText(scenario.panes[0][1], { exact: true }).first()).toBeVisible()
      if (scenario.entry === 'assembly')
        expect(reads.filter((x) => x === 'wms_assembly_component')).toHaveLength(2)
      if (scenario.entry === 'issue')
        expect(reads.filter((x) => x === 'rpc/wms_issue_request_lines_secure')).toHaveLength(2)
      expect(writes).toEqual([])
      expect(errors).toEqual([])
    })
  }
