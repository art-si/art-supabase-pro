import { expect, test } from '@playwright/test'
import { captureBusinessEvidence } from './support/capture-business-evidence'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(150_000)

for (const [theme, box] of [
  ['light', 'border-mode'],
  ['dark', 'shadow-mode']
]) {
  test(`分关系方案 ${theme} 独立条件、并发恢复与图标刷新`, async ({ page }, info) => {
    const configs = [
      {
        relation: 'payable_payment',
        description: '按来源应付匹配付款',
        rules: [
          {
            primary_field: 'source_id',
            secondary_field: 'source_id',
            operator: 'eq',
            empty_matches: false
          }
        ]
      },
      {
        relation: 'payable_red_blue',
        description: '同往来、同币种红蓝对冲',
        rules: [
          {
            primary_field: 'supplier_id',
            secondary_field: 'supplier_id',
            operator: 'eq',
            empty_matches: false
          },
          {
            primary_field: 'currency_code',
            secondary_field: 'currency_code',
            operator: 'eq',
            empty_matches: false
          }
        ]
      }
    ]
    const schemes = [1, 2].map((index) => ({
      id: `scheme-${index}`,
      code: `QA-MATRIX-${index}`,
      name: `示例分关系方案${index}`,
      enabled: true,
      automatic: index === 2,
      version: index,
      relation_rules: structuredClone(configs)
    }))
    let failMetadata = true
    let failSave = true
    let legacyCalls = 0
    let release = () => {}
    const refreshState: { gate?: Promise<void> } = {}
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', async (route) => {
      const name = new URL(route.request().url()).pathname.split('/').at(-1)
      if (name === 'fms_payable_scheme_configuration_secure') {
        if (refreshState.gate) await refreshState.gate
        return failMetadata
          ? route.fulfill({
              status: 403,
              json: { code: '42501', message: '方案读取失败，请核对权限后重试' }
            })
          : route.fulfill({
              json: {
                configuration_version: 2,
                relations: [
                  { label: '应付付款核销', value: 'payable_payment' },
                  { label: '应付红蓝对冲', value: 'payable_red_blue' }
                ],
                schemes
              }
            })
      }
      if (name === 'fms_payable_reference_list_secure') {
        legacyCalls++
        return route.fulfill({ json: schemes })
      }
      if (name === 'fms_payable_writeoff_workspace_secure')
        return route.fulfill({ json: { primary: [], secondary: [], history: [], schemes } })
      if (name === 'fms_save_payable_reference_secure') {
        const record = route.request().postDataJSON().p_record
        expect(record.configuration_version).toBe(2)
        expect(record.version).toBe(failSave ? 1 : 2)
        expect(record.relation_rules).toHaveLength(2)
        expect(record.relation_rules[1].rules).toHaveLength(2)
        return failSave
          ? route.fulfill({
              status: 409,
              json: { code: '40001', message: '方案已由其他人修改，请刷新后重新编辑' }
            })
          : route.fulfill({ json: record.id })
      }
      return route.fulfill({ json: [] })
    })
    await page.goto(
      `/tests/e2e/fixtures/purchase-payable.html?kind=writeoff&theme=${theme}&box=${box}`,
      { waitUntil: 'domcontentloaded', timeout: 120_000 }
    )
    await page.getByRole('button', { name: '核销方案', exact: true }).click()
    const settings = page.getByRole('dialog', { name: '应付核销方案', exact: true })
    await expect(settings).toContainText('当前账号没有此操作权限')
    expect(legacyCalls).toBe(0)
    await expect(settings.getByRole('button', { name: '新增方案', exact: true })).toBeDisabled()
    failMetadata = false
    await settings.getByRole('button', { name: '刷新方案', exact: true }).click()
    await expect(settings.locator('.el-table__body-wrapper tbody tr')).toHaveCount(2)
    await settings.getByRole('button', { name: '编辑方案', exact: true }).first().click()
    const editor = page.getByRole('dialog', { name: '编辑核销方案', exact: true })
    const red = editor
      .locator('.el-table__body-wrapper tbody tr')
      .filter({ hasText: '应付红蓝对冲' })
    await red.getByRole('button', { name: '移除核销关系', exact: true }).click()
    await page
      .getByRole('dialog', { name: '删除确认', exact: true })
      .getByRole('button', { name: '取消', exact: true })
      .click()
    await expect(red).toBeVisible()
    await editor
      .getByRole('switch', { name: '按核销关系分别配置', exact: true })
      .locator('..')
      .click()
    await page
      .getByRole('dialog', { name: '删除确认', exact: true })
      .getByRole('button', { name: '取消', exact: true })
      .click()
    await expect(
      editor.getByRole('switch', { name: '按核销关系分别配置', exact: true })
    ).toBeChecked()
    await red.getByRole('button', { name: '配置匹配规则', exact: true }).click()
    const rules = page.getByRole('dialog', { name: '核销匹配规则 · 应付红蓝对冲', exact: true })
    await expect(rules.locator('.el-table__body-wrapper tbody tr')).toHaveCount(2)
    await rules.getByRole('button', { name: '移除匹配规则', exact: true }).last().click()
    await page
      .getByRole('dialog', { name: '删除确认', exact: true })
      .getByRole('button', { name: '删除', exact: true })
      .click()
    await expect(rules.locator('.el-table__body-wrapper tbody tr')).toHaveCount(1)
    await rules.getByRole('button', { name: '关闭此对话框', exact: true }).click()
    await red.getByRole('button', { name: '配置匹配规则', exact: true }).click()
    await expect(rules.locator('.el-table__body-wrapper tbody tr')).toHaveCount(2)
    await captureBusinessEvidence(rules, {
      path: info.outputPath(`matrix-${theme}-conditions.png`)
    })
    await rules.getByRole('button', { name: '应用条件', exact: true }).click()
    await editor.getByRole('button', { name: '保存配置', exact: true }).click()
    await expect(editor).toBeVisible()
    await expect(editor.getByRole('textbox', { name: /^\*?\s*名称$/ })).toHaveValue(
      '示例分关系方案1'
    )
    await expect(
      page.getByText('数据已被其他操作更新，请刷新后重试', { exact: true })
    ).toBeVisible()
    await captureBusinessEvidence(editor, { path: info.outputPath(`matrix-${theme}-conflict.png`) })
    await editor.getByRole('button', { name: '关闭此对话框', exact: true }).click()
    schemes[0].version = 2
    failSave = false
    await settings.getByRole('button', { name: '刷新方案', exact: true }).click()
    await settings.getByRole('button', { name: '编辑方案', exact: true }).first().click()
    await editor.getByRole('button', { name: '保存配置', exact: true }).click()
    await expect(editor).not.toBeVisible()
    refreshState.gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const refresh = settings.getByRole('button', { name: '刷新方案', exact: true })
    try {
      await refresh.click()
      await expect(refresh).toHaveAttribute('aria-busy', 'true')
      await expect(settings.locator('.el-loading-mask:visible, .el-skeleton:visible')).toHaveCount(
        0
      )
      await expect(settings.locator('.el-table__body-wrapper tbody tr')).toHaveCount(2)
      await captureBusinessEvidence(settings, {
        path: info.outputPath(`matrix-${theme}-refresh.png`)
      })
    } finally {
      release()
    }
    await expect(refresh).not.toHaveAttribute('aria-busy', 'true')
    await expect(page.locator('html')).toHaveJSProperty(
      'scrollWidth',
      await page.evaluate(() => document.documentElement.clientWidth)
    )
    expect(errors).toEqual([])
  })
}
