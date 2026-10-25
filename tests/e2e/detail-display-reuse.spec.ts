import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

const vehiclePages = [
  {
    name: 'accident',
    rpc: 'vms_get_vehicle_accident_secure',
    selector: '.accident-record-detail__remark'
  },
  {
    name: 'maintenance',
    rpc: 'vms_get_vehicle_maintenance_secure',
    selector: '.maintenance-record-detail__remark'
  },
  {
    name: 'inspection',
    rpc: 'vms_get_vehicle_routine_inspection_secure',
    selector: '.routine-inspection-detail__text'
  },
  {
    name: 'insurance',
    rpc: 'vms_get_vehicle_insurance_secure',
    selector: '.vehicle-insurance-detail__remark'
  }
] as const

for (const vehicle of vehiclePages) {
  for (const value of [null, 0]) {
    test(`车辆详情共享文本保留空值与零值 ${vehicle.name} ${value}`, async ({ page }, info) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await prepareIsolatedSession(page)
      await page.route(`**/rest/v1/rpc/${vehicle.rpc}`, (route) =>
        route.fulfill({
          json: {
            id: 'display-test',
            plateNo: '测试车辆',
            companyName: '测试公司',
            remark: value,
            checkCondition: value,
            handlingMethod: value,
            attachments: [],
            maintenanceItems: [],
            fieldAccess: {
              accidentNarrative: 'read',
              inspectionFindings: 'read',
              remediationDetails: 'read',
              documents: 'read',
              maintenanceIdentifiers: 'read',
              maintenanceItems: 'read',
              insuranceIdentifiers: 'read'
            }
          }
        })
      )
      await page.goto(`/tests/e2e/fixtures/date-format-reuse.html?vehicle=${vehicle.name}`)
      const text = page.locator(vehicle.selector).last()
      await expect(text).toHaveText(value === null ? '--' : '0')
      await page.screenshot({ path: info.outputPath('detail-initial.png') })
      await text.scrollIntoViewIfNeeded()
      await page.screenshot({ path: info.outputPath('detail-text.png') })
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)
      ).toBe(true)
      expect(errors).toEqual([])
    })
  }
}

for (const mode of ['profit', 'collection'] as const) {
  for (const appearance of [
    { dark: false, shadow: false },
    { dark: false, shadow: true },
    { dark: true, shadow: false },
    { dark: true, shadow: true }
  ]) {
    for (const populated of mode === 'collection' ? [false, true] : [false]) {
      test(`财务分析抽屉共享日期保留秒精度 ${mode} populated=${populated} dark=${appearance.dark} shadow=${appearance.shadow}`, async ({
        page
      }, info) => {
        const errors: string[] = []
        page.on('pageerror', (error) => errors.push(error.message))
        await prepareIsolatedSession(page)
        const metrics =
          mode === 'profit'
            ? {
                totalWaybills: 0,
                finalizedWaybills: 0,
                receivableAmount: 0,
                totalCostAmount: 0,
                bookGrossProfit: 0,
                bookGrossMargin: null,
                costCoverage: 0,
                finalizedCostCoverage: 0,
                missingCostCount: 0,
                negativeMarginCount: 0,
                carrierPayableMissingCount: 0
              }
            : {
                totalStatementCount: 0,
                openStatementCount: 0,
                statementAmount: 0,
                settledAmount: 0,
                outstandingAmount: 0,
                collectionRate: 0,
                aging30Amount: 0,
                aging60Amount: 0,
                aging90Amount: 0,
                uninvoicedAmount: 0,
                reviewBlockedAmount: 0,
                atRiskAmount: 0
              }
        let attempt = 0
        const verifyRetry = populated && !appearance.dark && !appearance.shadow
        await page.route(
          `**/functions/v1/${mode === 'profit' ? 'ai-waybill-profit-analyst' : 'ai-receivables-collection-advisor'}`,
          (route) => {
            attempt += 1
            if (verifyRetry && attempt === 1)
              return route.fulfill({ status: 503, json: { message: '测试分析暂时不可用' } })
            return route.fulfill({
              json: {
                runId: 'display-test',
                ruleVersion: '测试规则',
                generatedAt: '2026-10-08T00:30:59Z',
                assessment: {
                  riskLevel: 'low',
                  riskScore: 0,
                  confidence: 1,
                  recommendation: 'routine_monitoring',
                  summary: '测试研判结论',
                  signals: populated
                    ? [
                        {
                          type: 'test-overdue',
                          severity: 'medium',
                          title: '测试回款风险信号',
                          detail: '测试对账款项需要复核。',
                          evidence: ['测试应收证据']
                        }
                      ]
                    : [],
                  riskWaybills: [],
                  priorityStatements: populated
                    ? [
                        {
                          id: 'test-statement',
                          statementNo: 'TEST-STATEMENT-001',
                          customerId: 'test-customer',
                          customerName: '测试客户名称用于核对窄屏内容换行',
                          periodStart: '2026-09-01',
                          periodEnd: '2026-09-30',
                          status: 'confirmed',
                          ageDays: 38,
                          statementAmount: 1234.5,
                          settledAmount: 0,
                          outstandingAmount: 1234.5,
                          uninvoicedAmount: 1234.5,
                          riskScore: 60,
                          reasons: ['测试账期需要跟进']
                        }
                      ]
                    : [],
                  riskCustomers: populated
                    ? [
                        {
                          customerId: 'test-customer',
                          customerName: '测试客户名称用于核对窄屏内容换行',
                          statementCount: 1,
                          outstandingAmount: 1234.5,
                          maxAgeDays: 38,
                          riskScore: 60,
                          statementNos: ['TEST-STATEMENT-001']
                        }
                      ]
                    : [],
                  recommendedActions: populated ? ['核对测试客户对账差异，再跟进到账计划。'] : [],
                  limitations: populated ? ['仅依据测试账期内的应收记录进行研判。'] : [],
                  metrics
                }
              }
            })
          }
        )
        await page.goto('/tests/e2e/fixtures/date-format-reuse.html')
        await page.evaluate(({ dark, shadow }) => {
          document.documentElement.classList.toggle('dark', dark)
          document.documentElement.dataset.boxMode = shadow ? 'shadow-mode' : 'border-mode'
        }, appearance)
        await page
          .getByRole('button', {
            name: mode === 'profit' ? '打开利润日期验收' : '打开回款日期验收',
            exact: true
          })
          .click()
        const drawer = page.getByRole('dialog')
        if (verifyRetry) {
          await expect(drawer.getByText('回款风险分析失败', { exact: true })).toBeVisible()
          await page.screenshot({ path: info.outputPath('analysis-error.png') })
          await drawer.getByRole('button', { name: '重新加载', exact: true }).click()
        }
        await expect(drawer.getByText('测试研判结论', { exact: true })).toBeVisible()
        await page.screenshot({ path: info.outputPath('analysis-initial.png') })
        if (mode === 'collection') {
          if (populated) {
            await expect(drawer.getByText('TEST-STATEMENT-001', { exact: true })).toBeVisible()
            await drawer.getByText('测试回款风险信号', { exact: true }).scrollIntoViewIfNeeded()
            const customerName = drawer.locator('.collection-advisor__customers strong')
            await expect(customerName).toHaveCSS('white-space', 'normal')
            await expect(drawer.locator('.collection-advisor__customers small')).toHaveCSS(
              'white-space',
              'nowrap'
            )
            expect(
              await drawer
                .locator('.collection-advisor')
                .evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
            ).toBe(true)
            await page.screenshot({ path: info.outputPath('analysis-risk.png') })
            await expect(
              drawer.getByText('核对测试客户对账差异，再跟进到账计划。', { exact: true })
            ).toBeVisible()
            await expect(
              drawer.getByText('仅依据测试账期内的应收记录进行研判。', { exact: true })
            ).toBeVisible()
            await expect(drawer.getByText('暂无处理建议', { exact: true })).toHaveCount(0)
          } else {
            await expect(drawer.getByText('暂无处理建议', { exact: true })).toBeVisible()
            await expect(drawer.getByText('暂无补充说明', { exact: true })).toBeVisible()
            await expect(drawer.getByText('暂无高关注客户', { exact: true })).toBeVisible()
          }
        }
        const meta = drawer.locator('footer').last()
        await meta.scrollIntoViewIfNeeded()
        await expect(meta).toContainText('2026-10-08 08:30:59')
        const style = await meta.evaluate((element) => {
          const probe = document.createElement('span')
          probe.style.color = 'var(--art-gray-700)'
          element.append(probe)
          const expected = getComputedStyle(probe).color
          const actual = getComputedStyle(element)
          const result = {
            color: actual.color,
            expected,
            display: actual.display,
            wrap: actual.flexWrap,
            fontSize: actual.fontSize
          }
          probe.remove()
          return result
        })
        expect(style).toMatchObject({
          color: style.expected,
          display: 'flex',
          wrap: 'wrap',
          fontSize: '12px'
        })
        await page.screenshot({ path: info.outputPath('analysis-date.png') })
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)
        ).toBe(true)
        expect(errors).toEqual([])
      })
    }
  }
}
