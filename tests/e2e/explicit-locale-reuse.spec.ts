import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { contrast } from './text-contrast'

test.use({
  storageState: { cookies: [], origins: [] },
  locale: 'ar-EG',
  timezoneId: 'Asia/Shanghai'
})

for (const mode of [
  'ocr',
  'prompt',
  'configuration',
  'payroll',
  'opening',
  'voucher',
  'violation',
  'chat'
]) {
  test(`公共地区格式 ${mode}`, async ({ page }, info) => {
    test.setTimeout(180_000)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.addInitScript(() => {
      localStorage.setItem(
        'sb-ckbftoopuyophiebamwy-auth-token',
        JSON.stringify({
          access_token: 'a.b.c',
          refresh_token: 'test-refresh-token',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          token_type: 'bearer',
          user: {
            id: '11111111-1111-4111-8111-111111111111',
            aud: 'authenticated',
            role: 'authenticated'
          }
        })
      )
    })
    await page.route('**/rest/v1/**', async (route) => {
      const endpoint = new URL(route.request().url()).pathname.split('/').at(-1)
      const access = { employeeIdentity: 'read', salaryAmounts: 'hidden' }
      const balanceAccess = { balanceAmounts: 'read', auxiliaryDetails: 'read' }
      let json: unknown = []
      if (endpoint === 'fms_list_account_set_options_secure')
        json = {
          records: [
            {
              id: 'account-test',
              accountSetCode: 'TEST',
              accountSetName: '测试账套',
              status: 'active'
            }
          ],
          total: 1
        }
      if (endpoint === 'fms_list_payroll_runs_secure')
        json = {
          records: [1234, '01234', '***', 0, null].map((employeeCount, index) => ({
            id: `payroll-${index}`,
            runNo: `PAY-${index}`,
            payrollMonth: '2026-10-01',
            employeeCount,
            accountSetId: 'account-test',
            status: 'draft',
            createTime: '2026-10-10T00:00:00Z',
            fieldAccess: access
          })),
          total: 5,
          fieldAccess: access
        }
      if (endpoint === 'fms_payroll_summary_secure')
        json = {
          runCount: 5,
          pendingCount: 5,
          employeeCount: 1234,
          grossAmount: '***',
          netAmount: '***',
          fieldAccess: access
        }
      if (endpoint === 'fms_list_opening_balances_secure')
        json = {
          records: [1234.56789, 0, null, '***', ''].map((originalCurrencyAmount, index) => ({
            id: `balance-${index}`,
            accountSetId: 'account-test',
            fiscalYear: 2026,
            openingDebit: 0,
            openingCredit: 0,
            originalCurrencyAmount,
            auxiliaryValues: {},
            subject: {
              subjectCode: `OB-${index}`,
              subjectName: `测试余额 ${index}`,
              balanceDirection: 'debit'
            },
            currency: { currencyCode: 'EUR', currencyName: '欧元' },
            fieldAccess: balanceAccess
          })),
          fieldAccess: balanceAccess
        }
      if (endpoint === 'fms_opening_balance_summary_secure')
        json = {
          entryCount: 5,
          openingDebit: 0,
          openingCredit: 0,
          difference: 0,
          status: 'draft',
          isBalanced: true,
          fieldAccess: balanceAccess
        }
      if (endpoint === 'fms_currency')
        json = [{ id: 'cny-test', currencyCode: 'CNY', isBase: true, isEnabled: true }]
      if (endpoint === 'get_effective_ai_feature_configs')
        json = [
          {
            id: 'configuration-test',
            feature: 'sql_assistant',
            enabled: true,
            inherited: true,
            provider: 'test',
            model: '测试模型',
            timeoutMs: 30_000,
            maxRetries: 1,
            temperature: 0.2,
            maxTokens: 2000,
            rateLimitPerMinute: 10,
            rateLimitPerDay: 1234,
            promptVersion: 'v1',
            metadata: {},
            createTime: '2026-10-10T00:00:00Z',
            updateTime: '2026-10-10T00:00:00Z'
          }
        ]
      if (endpoint === 'smis_list_violation_categories_secure')
        json = {
          records: [],
          tree: [],
          total: 0,
          overview: { total: 0, enabled: 0, disabled: 0 }
        }
      if (endpoint === 'smis_list_anti_violation_standards_secure')
        json = {
          records: [1234.56789, 0].map((deductionPoints, index) => ({
            id: `standard-${index}`,
            standardCode: `STD-${index}`,
            standardName: `测试扣分标准 ${index}`,
            categoryName: '测试分类',
            deductionPoints,
            status: 'enabled',
            sort: index
          })),
          total: 2,
          overview: { total: 2, enabled: 2, disabled: 0 }
        }
      await route.fulfill({
        json,
        headers: { 'content-range': '0-4/5', 'access-control-expose-headers': 'content-range' }
      })
    })
    if (mode === 'chat') await page.clock.setFixedTime(new Date('2026-10-09T16:06:07Z'))
    await page.goto(`/tests/e2e/fixtures/explicit-locale-reuse.html?mode=${mode}`)
    if (mode === 'ocr') {
      const count = page.locator('.ocr-original-text__meta > span')
      await expect(count).toHaveText('1,234 字')
      if (info.project.use.isMobile) await expect(count).toBeHidden()
      else await expect(count).toBeVisible()
      await expect(page.getByLabel('识别结果原文')).toHaveValue('内容'.repeat(617))
      for (const theme of ['light', 'dark']) {
        for (const box of ['border-mode', 'shadow-mode']) {
          await page.evaluate(
            ({ theme, box }) => {
              document.documentElement.classList.toggle('dark', theme === 'dark')
              document.documentElement.dataset.boxMode = box
            },
            { theme, box }
          )
          expect(
            await contrast(page.locator('.ocr-original-text__title small'))
          ).toBeGreaterThanOrEqual(4.5)
          if (!info.project.use.isMobile) expect(await contrast(count)).toBeGreaterThanOrEqual(4.5)
          await page.screenshot({
            path: info.outputPath(`ocr-${theme}-${box}.png`),
            animations: 'disabled'
          })
        }
      }
      await page.evaluate(() => {
        document.documentElement.classList.remove('dark')
        document.documentElement.dataset.boxMode = 'border-mode'
      })
      await page.getByRole('button', { name: '清空识别原文' }).click()
      await expect(count).toHaveText('0 字')
      await expect(page.getByText('暂无识别原文', { exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: '复制原文' })).toBeDisabled()
    } else if (mode === 'prompt') {
      await page.getByRole('button', { name: '打开提示词测试' }).click()
      await page
        .getByPlaceholder('请定义 AI 的角色、任务目标、事实边界、禁止事项与回答风格')
        .fill('内容'.repeat(617))
      await expect(
        page.locator('.el-dialog').getByText('1,234 / 16,000', { exact: true })
      ).toHaveText('1,234 / 16,000')
      await expect(
        page
          .getByPlaceholder('请定义 AI 的角色、任务目标、事实边界、禁止事项与回答风格')
          .locator('..')
          .locator('.el-input__count')
      ).toContainText('1234')
      await page
        .getByPlaceholder('请定义 AI 的角色、任务目标、事实边界、禁止事项与回答风格')
        .fill('')
      await expect(page.locator('.el-dialog').getByText('0 / 16,000', { exact: true })).toHaveText(
        '0 / 16,000'
      )
    } else if (mode === 'configuration') {
      await expect(page.getByText('租户总日配额 1,234 次', { exact: true })).toHaveText(
        '租户总日配额 1,234 次'
      )
      await expect(page.getByText('只读模式', { exact: true })).toBeVisible()
    } else if (mode === 'payroll') {
      const rows = page.locator('.payroll-page .el-table__body-wrapper tbody tr')
      await expect(rows).toHaveCount(5)
      for (const [index, value] of ['1,234', '01234', '***', '0', '--'].entries()) {
        await expect(rows.nth(index).getByText(value, { exact: true })).toBeVisible()
      }
      await expect(page.getByRole('columnheader', { name: '应发金额', exact: true })).toHaveCount(0)
    } else if (mode === 'opening') {
      if (info.project.use.isMobile) {
        const cards = page.locator('.opening-balance-page article').filter({ hasText: '测试余额' })
        await expect(cards).toHaveCount(5)
        for (const [index, value] of ['1,234.568', '0', '—', '***', '—'].entries()) {
          const originalAmount = cards.nth(index).locator('p').filter({ hasText: '原币金额' })
          await expect
            .poll(async () => (await originalAmount.textContent())?.split('原币金额')[1]?.trim())
            .toBe(value)
        }
      } else {
        const rows = page.locator('.opening-balance-page .el-table__body-wrapper tbody tr')
        await expect(rows).toHaveCount(5)
        await page
          .locator('.opening-balance-page .el-table__body-wrapper .el-scrollbar__wrap')
          .first()
          .evaluate((el) => {
            el.scrollLeft = el.scrollWidth
          })
        for (const [index, value] of ['1,234.568', '0', '—', '***', '—'].entries()) {
          await expect(rows.nth(index).getByText(value, { exact: true }).last()).toBeVisible()
        }
      }
    } else if (mode === 'voucher') {
      await expect(page.getByText('EUR 1,234.568', { exact: true })).toBeVisible()
      await expect(page.getByText('1,234.568 件', { exact: true })).toBeVisible()
      await expect(page.getByText('EUR 0', { exact: true })).toBeVisible()
      await expect(page.getByText('0 件', { exact: true })).toBeVisible()
    } else if (mode === 'violation') {
      await expect(page.getByText('1,234.568 分', { exact: true })).toBeVisible()
      await expect(page.getByText('0 分', { exact: true })).toBeVisible()
    } else {
      const downloadEvent = page.waitForEvent('download')
      await page.getByRole('button', { name: '导出测试会话' }).click()
      const download = await downloadEvent
      expect(download.suggestedFilename()).toBe('supabase-ai-2026-10-10.md')
      const filePath = info.outputPath('conversation.md')
      await download.saveAs(filePath)
      const markdown = await readFile(filePath, 'utf8')
      expect(markdown).toContain('- 导出时间：2026-10-10 00:06:07')
      expect(markdown).toContain('测试会话内容')
    }
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
      .toBeLessThanOrEqual(1)
    await page.screenshot({
      path: info.outputPath(`${mode}.png`),
      fullPage: true,
      animations: 'disabled'
    })
    expect(errors).toEqual([])
  })
}
