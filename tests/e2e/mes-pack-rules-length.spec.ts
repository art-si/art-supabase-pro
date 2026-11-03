import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

test('规则编辑显示长度顺序和混包方式，保存所选配置', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const saved: Record<string, unknown>[] = []
  const row = {
    id: 'rule-1',
    tenant_id: 'packing-test-tenant',
    rule_code: 'ROCK_BOARD',
    rule_name: '岩棉板排包规则',
    enabled: true,
    max_pieces: 8,
    max_stack_height: 600,
    board_thickness_mm: null,
    max_weight: null,
    max_length: null,
    same_width: true,
    same_area: true,
    same_number: true,
    allow_mix_length: false,
    length_sort_direction: 'desc',
    remainder_policy: 'separate',
    sort_priority: 'area,boardNo,width,length',
    remark: '',
    update_time: '2026-10-26T00:00:00Z'
  }
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.route('**/rest/v1/sys_dictionary?*', (route) => {
    const code = new URL(route.request().url()).searchParams
      .get('dict_type_table.code')
      ?.replace(/^eq\./, '')
    const dictionaries: Record<string, Array<[string, string]>> = {
      mesPackRuleBoardType: [
        ['ROCK_BOARD', '岩棉夹芯板'],
        ['PU_BOARD', '聚氨酯夹芯板']
      ],
      mesPackRuleSmallPackMode: [
        ['separate', '独立小包'],
        ['merge', '尝试并包'],
        ['manual', '人工处理']
      ],
      mesPackRuleLengthDirection: [
        ['asc', '升序'],
        ['desc', '降序']
      ],
      mesPackRuleLengthMode: [
        ['true', '混合式打包'],
        ['false', '分开打包']
      ]
    }
    return route.fulfill({
      json: (dictionaries[code ?? ''] ?? []).map(([value, label], index) => ({
        id: `${code}-${value}`,
        code: value,
        value,
        label,
        status: '1',
        sort: index,
        dict_type_table: { code, name: code }
      }))
    })
  })
  await page.route('**/rest/v1/mes_pack_rule?*', (route) => route.fulfill({ json: [row] }))
  await page.route('**/rest/v1/rpc/mes_save_pack_rule', (route) => {
    const payload = route.request().postDataJSON() as { p_payload: Record<string, unknown> }
    saved.push(payload.p_payload)
    row.length_sort_direction = String(payload.p_payload.length_sort_direction)
    row.allow_mix_length = Boolean(payload.p_payload.allow_mix_length)
    return route.fulfill({ json: null })
  })

  await page.goto('/tests/e2e/fixtures/mes-pack-rules.html', {
    waitUntil: 'domcontentloaded',
    timeout: 120_000
  })
  await expect(page.getByText('岩棉板排包规则')).toBeVisible({ timeout: 120_000 })
  await page.getByRole('button', { name: '编辑规则' }).click()
  const dialog = page.getByRole('dialog', { name: '编辑排包规则' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('tab', { name: '单包约束', exact: true }).click()
  await expect(dialog.getByText('同区域、同编号的长度顺序')).toBeVisible()
  await expect(dialog.getByText('不同长度的打包方式')).toBeVisible()
  await dialog.getByText('升序', { exact: true }).click()
  await dialog.getByText('混合式打包', { exact: true }).click()
  await dialog.locator('textarea').scrollIntoViewIfNeeded()
  await page.screenshot({
    path: testInfo.outputPath('pack-rule-length-editor.png'),
    fullPage: true
  })
  await dialog.getByRole('button', { name: '保存规则' }).click()
  await expect.poll(() => saved.length).toBe(1)
  expect(saved[0].length_sort_direction).toBe('asc')
  expect(saved[0].allow_mix_length).toBe(true)
  await expect(page.getByText('同区域、同编号内按长度升序')).toBeVisible()
  await expect(page.getByText(/同编号内不同长度混合式打包/)).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(
    false
  )
  await page.screenshot({ path: testInfo.outputPath('pack-rules-length.png'), fullPage: true })
  expect(errors).toEqual([])
})
