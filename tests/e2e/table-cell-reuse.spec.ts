import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(90_000)
for (const feature of ['contingent', 'organization', 'policy', 'equipment', 'recruitment']) {
  test(`${feature} 复用单元格的实际样式和内容在窄屏保持正常`, async ({ page }, testInfo) => {
    await prepareIsolatedSession(page)
    await page.clock.setFixedTime(new Date('2026-10-09T08:00:00+08:00'))
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', (route) => {
      const url = route.request().url()
      if (url.includes('hr_list_recruitment_records_secure'))
        return route.fulfill({
          json: {
            records: [
              {
                id: 'requisition-actions',
                requisition_no: 'HRRQ-ACTIONS-001',
                status: 'draft',
                opening_count: 1,
                hired_count: 0,
                tenant_id: 'test-tenant',
                employment_type: 'full_time',
                position: { name: '测试岗位' },
                organization: { name: '测试组织' }
              }
            ],
            total: 1,
            sensitive_access: false
          }
        })
      if (url.includes('hr_list_contingent_workforce_records_secure'))
        return route.fulfill({
          json: {
            records: [
              {
                id: 'task',
                engagement_no: 'EXT-001',
                worker_name: '测试用工人员',
                status: 'active',
                start_date: '2026-10-01',
                end_date: '2026-12-31',
                access_expiry_date: '2026-10-08',
                pending_control_count: 2,
                control_count: 3
              }
            ],
            total: 1
          }
        })
      if (url.includes('hr_list_organization_design_records_secure'))
        return route.fulfill({
          json: {
            records: [
              {
                id: 'scenario',
                scenario_name: '组织影响验证',
                scenario_code: 'ORG-001',
                status: 'draft',
                risk_level: 'low',
                change_count: 2,
                impacted_employee_count: 20,
                impacted_position_count: 3,
                impacted_security_user_count: 1
              }
            ],
            total: 1
          }
        })
      if (url.includes('hr_list_policy_acknowledgement_records_secure'))
        return route.fulfill({
          json: {
            records: [
              {
                id: 'policy',
                policy_code: 'POL-001',
                policy_title: '签收进度验证',
                version_no: 1,
                effective_date: '2026-10-01',
                acknowledgement_due_days: 7,
                status: 'draft',
                audience_type: 'all',
                acknowledged_count: 5,
                waived_count: 1,
                receipt_count: 10,
                overdue_count: 2
              },
              {
                id: 'empty',
                policy_code: 'POL-EMPTY',
                policy_title: '空进度验证',
                version_no: 1,
                effective_date: '2026-10-01',
                acknowledgement_due_days: 7,
                status: 'draft',
                audience_type: 'all',
                receipt_count: 0
              }
            ],
            total: 2
          }
        })
      if (url.includes('mdm_list_production_equipment_v2_secure')) {
        const base = {
          tenant_id: 'test-tenant',
          category_name: '测试设备分类',
          status: 'enabled',
          operation_status: 'normal'
        }
        return route.fulfill({
          json: {
            records: [
              {
                ...base,
                id: 'photo',
                equipment_name: '带图片设备',
                equipment_code: 'EQ-PHOTO',
                photo_url:
                  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="36" height="36"%3E%3Crect width="36" height="36" fill="%23409eff"/%3E%3C/svg%3E'
              },
              {
                ...base,
                id: 'fallback',
                equipment_name: '无图片设备',
                equipment_code: 'EQ-FALLBACK'
              },
              {
                ...base,
                id: 'broken',
                equipment_name: '图片失效设备',
                equipment_code: 'EQ-BROKEN',
                photo_url: 'data:image/png;base64,broken'
              }
            ],
            total: 3,
            overview: { total: 3, enabled: 3, connected: 0, unassigned: 3 },
            references: {
              categories: [],
              departments: [],
              locations: [],
              work_centers: [],
              suppliers: []
            }
          }
        })
      }
      return route.fulfill({ json: [] })
    })
    await page.goto(
      feature === 'equipment'
        ? '/tests/e2e/fixtures/production-equipment-cell.html'
        : feature === 'recruitment'
          ? '/tests/e2e/fixtures/hr-all-pages.html?page=recruitment/workbench'
          : `/tests/e2e/fixtures/hr-page-layout.html?page=${feature}`
    )
    await expect(page.locator('.business-workspace-page')).toBeVisible({ timeout: 60_000 })
    const rows = page.locator('.el-table__body tr')
    if (feature === 'contingent') {
      const cell = page
        .locator('.business-table-identity-cell')
        .filter({ hasText: '2026-10-01 → 2026-12-31' })
        .first()
      await cell.scrollIntoViewIfNeeded()
      const bounds = await cell.evaluate((element) => {
        const primary = element.querySelector('strong')!
        const secondary = element.querySelector('small')!
        const probe = document.createElement('span')
        probe.style.color = 'var(--el-color-warning)'
        element.appendChild(probe)
        const riskColor = getComputedStyle(probe).color
        probe.remove()
        return {
          bottom: primary.getBoundingClientRect().bottom,
          primaryWidth: primary.clientWidth,
          primaryScrollWidth: primary.scrollWidth,
          top: secondary.getBoundingClientRect().top,
          display: getComputedStyle(primary.parentElement!).display,
          color: getComputedStyle(secondary).color,
          riskColor,
          weight: getComputedStyle(secondary).fontWeight
        }
      })
      expect(bounds.display).toBe('grid')
      expect(bounds.primaryScrollWidth).toBeLessThanOrEqual(bounds.primaryWidth)
      expect(bounds.top).toBeGreaterThanOrEqual(bounds.bottom)
      expect(Number(bounds.weight)).toBeGreaterThanOrEqual(600)
      expect(bounds.color).toBe(bounds.riskColor)
      await expect(rows.first().getByText('2 / 3 待完成', { exact: true })).toBeAttached()
    } else if (feature === 'organization') {
      const impact = rows.first().locator('.el-tag').filter({ hasText: '1 账号' })
      await impact.scrollIntoViewIfNeeded()
      await expect(impact).toHaveClass(/el-tag--danger/)
      expect(
        await impact.evaluate((element) => getComputedStyle(element.parentElement!).display)
      ).toBe('flex')
    } else if (feature === 'policy') {
      const progress = page.getByRole('progressbar').first()
      await progress.scrollIntoViewIfNeeded()
      await expect(progress).toHaveAttribute('aria-valuenow', '60')
      await expect(page.getByRole('progressbar').nth(1)).toHaveAttribute('aria-valuenow', '0')
      expect(
        await progress
          .locator('.el-progress-bar__inner')
          .evaluate((element) => element.getBoundingClientRect().height)
      ).toBe(5)
      await expect(page.getByText('6 / 10 · 60% · 2 逾期', { exact: true })).toBeVisible()
    } else if (feature === 'recruitment') {
      const actions = rows.first().locator('.business-table-row-actions')
      await expect(actions).toBeVisible()
      expect(await actions.evaluate((element) => getComputedStyle(element).gap)).toBe('8px')
      await expect(actions.locator('.art-button-table')).toHaveCount(1)
      await actions.locator('.el-dropdown').click()
      await expect(page.getByRole('menuitem', { name: '提交审批' })).toBeVisible()
      await expect(page.getByRole('menuitem', { name: '删除招聘需求' })).toBeVisible()
      await page.keyboard.press('Escape')
    } else {
      const image = rows
        .filter({ hasText: 'EQ-PHOTO' })
        .first()
        .getByRole('img', { name: '带图片设备缩略图' })
      await image.scrollIntoViewIfNeeded()
      await expect(image).toBeVisible()
      expect(await image.evaluate((element) => element.getBoundingClientRect().width)).toBe(36)
      for (const code of ['EQ-PHOTO', 'EQ-FALLBACK', 'EQ-BROKEN']) {
        const row = rows.filter({ hasText: code }).first()
        await expect(row.locator('.business-table-identity-cell').first()).toBeAttached()
        if (code !== 'EQ-PHOTO') {
          await expect(row.locator('.el-avatar svg')).toBeAttached()
          const colors = await row.locator('.el-avatar').evaluate((element) => {
            const probe = document.createElement('span')
            probe.style.color = 'var(--theme-color)'
            probe.style.backgroundColor = 'var(--art-gray-100)'
            element.appendChild(probe)
            const expected = getComputedStyle(probe)
            const result = {
              color: getComputedStyle(element).color,
              background: getComputedStyle(element).backgroundColor,
              expectedColor: expected.color,
              expectedBackground: expected.backgroundColor
            }
            probe.remove()
            return result
          })
          expect(colors.color).toBe(colors.expectedColor)
          expect(colors.background).toBe(colors.expectedBackground)
        }
      }
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1)
    expect(errors).toEqual([])
    await page.screenshot({
      path: testInfo.outputPath(`${feature}-cell.png`),
      animations: 'disabled'
    })
  })
}
