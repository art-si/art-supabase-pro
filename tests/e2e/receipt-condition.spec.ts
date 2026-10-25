import { expect, test } from '@playwright/test'
import type { Route } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(60000)

test('两条收款条件保存响应期间撤权保留输入并抑制旧成功反馈', async ({ page }, info) => {
  const saves: Array<{ p_payload: { id: string; name: string } }> = []
  let held: Route | undefined
  let reads = 0
  await page.route('**/rest/v1/**', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1)
    if (name === 'fms_receivable_workspace_secure') {
      reads++
      return route.fulfill({
        json: {
          records: [1, 2].map((index) => ({
            id: `condition-${index}`,
            condition_code: `QA-LATE-${index}`,
            name: `延迟账期${index}`,
            due_days: 30,
            is_enabled: true
          })),
          total: 2
        }
      })
    }
    if (name === 'fms_save_receipt_condition_secure') {
      saves.push(route.request().postDataJSON())
      held = route
      return
    }
    return route.fulfill({ json: [] })
  })
  const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
  await page.goto(
    `/tests/e2e/fixtures/receivable-workspace.html?kind=condition&theme=${theme}&permissionControls=1&permissions=MdmReceiptCondition:View,MdmReceiptCondition:Edit`
  )
  for (const index of [1, 2]) {
    await page
      .getByRole('row')
      .filter({ hasText: `QA-LATE-${index}` })
      .getByRole('button', { name: '编辑', exact: true })
      .click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('textbox', { name: '名称' }).fill(`延迟账期${index}已修改`)
    held = undefined
    await dialog.getByRole('button', { name: '保存收款条件', exact: true }).click()
    await expect.poll(() => saves.length).toBe(index)
    const readsBefore = reads
    await page.keyboard.press('Alt+Shift+4')
    if (!held) throw new Error('未捕获收款条件保存请求')
    await held.fulfill({ json: `condition-${index}` })
    await expect(dialog.getByRole('button', { name: '保存收款条件', exact: true })).toBeEnabled()
    await expect(dialog.getByRole('textbox', { name: '名称' })).toHaveValue(
      `延迟账期${index}已修改`
    )
    await expect(page.locator('.el-message--success')).toHaveCount(0)
    expect(reads).toBe(readsBefore)
    expect(saves[index - 1].p_payload).toMatchObject({
      id: `condition-${index}`,
      name: `延迟账期${index}已修改`
    })
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    await page.keyboard.press('Alt+Shift+5')
  }
})

test('两条收款条件删除确认期间撤权阻止旧确认', async ({ page }, info) => {
  let checks = 0
  const deletes: unknown[] = []
  const records = [1, 2].map((index) => ({
    id: `condition-${index}`,
    condition_code: `QA-DELETE-${index}`,
    name: `删除保护账期${index}`,
    due_days: 30,
    is_enabled: true
  }))
  await page.route('**/rest/v1/**', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1)
    if (name === 'fms_receivable_workspace_secure')
      return route.fulfill({ json: { records, total: 2 } })
    if (name === 'fms_ar_delete_dependencies_secure') checks++
    if (name === 'fms_delete_ar_records_secure') deletes.push(route.request().postDataJSON())
    return route.fulfill({ json: [] })
  })
  const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
  await page.goto(
    `/tests/e2e/fixtures/receivable-workspace.html?kind=condition&theme=${theme}&permissionControls=1&permissions=MdmReceiptCondition:View,MdmReceiptCondition:Delete`
  )
  await expect(page.getByText('QA-DELETE-2', { exact: true })).toBeVisible()
  await page.locator('.el-table__header-wrapper label.el-checkbox').first().click()
  await page.getByRole('button', { name: '批量删除', exact: true }).click()
  const confirmation = page.locator('.el-message-box')
  await expect(confirmation).toContainText('2 个无引用的收款条件')
  expect(checks).toBe(1)
  await page.keyboard.press('Alt+Shift+9')
  await confirmation.getByRole('button', { name: '删除', exact: true }).click()
  await expect(
    page.getByText('操作范围或权限已变化，请重新查询后删除', { exact: true })
  ).toBeVisible()
  expect(deletes).toEqual([])
  await expect(page.getByText('QA-DELETE-1', { exact: true })).toBeVisible()
  await expect(page.getByText('QA-DELETE-2', { exact: true })).toBeVisible()
})

test('两条收款条件编辑期间撤权阻止保存，恢复后可取消重开', async ({ page }, info) => {
  const saves: unknown[] = []
  await page.route('**/rest/v1/**', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1)
    if (name === 'fms_receivable_workspace_secure')
      return route.fulfill({
        json: {
          records: [1, 2].map((index) => ({
            id: `condition-${index}`,
            condition_code: `QA-GUARD-${index}`,
            name: `权限账期${index}`,
            due_days: 30,
            is_enabled: true
          })),
          total: 2
        }
      })
    if (name === 'fms_save_receipt_condition_secure') {
      saves.push(route.request().postDataJSON())
      return route.fulfill({ json: 'condition-1' })
    }
    return route.fulfill({ json: [] })
  })
  const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
  await page.goto(
    `/tests/e2e/fixtures/receivable-workspace.html?kind=condition&theme=${theme}&permissionControls=1&permissions=MdmReceiptCondition:View,MdmReceiptCondition:Edit`
  )
  for (const index of [1, 2]) {
    await expect(page.locator('.el-message')).toHaveCount(0)
    await page
      .getByRole('row')
      .filter({ hasText: `QA-GUARD-${index}` })
      .getByRole('button', { name: '编辑', exact: true })
      .click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('textbox', { name: '名称' }).fill(`权限账期${index}待保存`)
    await page.keyboard.press('Alt+Shift+4')
    await dialog.getByRole('button', { name: '保存收款条件', exact: true }).click()
    await expect(
      page.getByText('操作范围或权限已变化，请重新打开收款条件', { exact: true })
    ).toBeVisible()
    await expect(dialog.getByRole('textbox', { name: '名称' })).toHaveValue(
      `权限账期${index}待保存`
    )
    expect(saves).toEqual([])
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    await page.keyboard.press('Alt+Shift+5')
  }
})

test('两条收款条件新增、编辑停用、保存失败恢复与引用保护', async ({ page }, info) => {
  const records: Array<{
    id: string
    condition_code: string
    name: string
    due_days: number
    is_enabled: boolean
    remark: string
  }> = []
  const saves: Array<Record<string, unknown>> = []
  const deletes: string[][] = []
  let fail = true
  let blocked = true
  await page.route('**/rest/v1/**', (route) => {
    const url = new URL(route.request().url())
    const name = url.pathname.split('/').at(-1)
    const body = route.request().postDataJSON()
    if (name === 'sys_dictionary')
      return route.fulfill({
        json: [true, false].map((value) => ({
          id: String(value),
          code: String(value),
          value: String(value),
          label: value ? '是' : '否',
          status: '1',
          dict_type_table: { code: 'commonBoolean' }
        }))
      })
    if (name === 'fms_receivable_workspace_secure') {
      const ids = body.p_query?.ids as string[] | undefined
      const rows = ids ? records.filter((row) => ids.includes(row.id)) : records
      return route.fulfill({ json: { records: rows, total: rows.length } })
    }
    if (name === 'fms_save_receipt_condition_secure') {
      saves.push(body.p_payload)
      if (fail)
        return route.fulfill({
          status: 400,
          json: { code: 'P0001', message: '收款条件保存失败，请重试' }
        })
      const payload = body.p_payload
      const record = {
        id: payload.id || `condition-${records.length + 1}`,
        condition_code: payload.code,
        name: payload.name,
        due_days: payload.dueDays,
        is_enabled: payload.isEnabled,
        remark: payload.remark
      }
      const index = records.findIndex((row) => row.id === payload.id)
      if (index < 0) records.push(record)
      else records[index] = record
      return route.fulfill({ json: record.id })
    }
    if (name === 'fms_ar_delete_dependencies_secure')
      return route.fulfill({
        json: blocked
          ? [
              {
                resource_id: 'condition-1',
                dependency_code: 'financial',
                record_id: 'financial',
                target_id: 'financial',
                record_no: 'QA-CONDITION-AR-001',
                record_summary: '引用本账期的财务应收',
                record_status: 'approved',
                cleanup_allowed: false
              }
            ]
          : []
      })
    if (name === 'fms_delete_ar_records_secure') {
      expect(body.p_kind).toBe('condition')
      deletes.push(body.p_ids)
      records.splice(0, records.length)
      return route.fulfill({ json: null })
    }
    return route.fulfill({ json: [] })
  })
  const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
  await page.goto(`/tests/e2e/fixtures/receivable-workspace.html?kind=condition&theme=${theme}`)
  for (const index of [1, 2]) {
    const attemptsBefore = saves.length
    await page.getByRole('button', { name: '新增', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: '保存收款条件' }).click()
    expect(saves).toHaveLength(attemptsBefore)
    await dialog.getByRole('textbox', { name: '编号' }).fill(`QA-TERM-${index}`)
    await dialog.getByRole('textbox', { name: '名称' }).fill(`验收账期${index}`)
    await dialog.getByRole('spinbutton', { name: '账期天数' }).fill(String(index * 30))
    await dialog.getByRole('textbox', { name: '描述' }).fill(`仅演示账期${index}`)
    await dialog.getByRole('button', { name: '保存收款条件' }).click()
    if (index === 1) {
      await expect(page.locator('.el-message--error')).toHaveCount(1)
      await expect(dialog.getByRole('textbox', { name: '名称' })).toHaveValue('验收账期1')
      fail = false
      await dialog.getByRole('button', { name: '保存收款条件' }).click()
    }
    await expect(dialog).not.toBeVisible()
    const row = page.getByRole('row').filter({ hasText: `QA-TERM-${index}` })
    await expect(row).toContainText('启用')
    await row.getByRole('button', { name: '编辑', exact: true }).click()
    await dialog.getByText('否', { exact: true }).click()
    await dialog.getByRole('textbox', { name: '名称' }).fill(`验收账期${index}已复核`)
    if (index === 2) {
      await expect(page.locator('.el-message')).toHaveCount(0)
      await dialog.screenshot({ path: info.outputPath('condition-editor.png') })
    }
    await dialog.getByRole('button', { name: '保存收款条件' }).click()
    await expect(dialog).not.toBeVisible()
    await expect(row).toContainText('停用')
    await expect(row).toContainText(`验收账期${index}已复核`)
  }
  await expect(page.locator('.el-message')).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('conditions-two-records.png'), fullPage: true })
  await page.locator('.el-table__header-wrapper label.el-checkbox').first().click()
  await page.getByRole('button', { name: '批量删除', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('QA-CONDITION-AR-001')
  await page.screenshot({ path: info.outputPath('condition-reference.png'), fullPage: true })
  expect(deletes).toEqual([])
  await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click()
  blocked = false
  await page.getByRole('button', { name: '批量删除', exact: true }).click()
  await page.locator('.el-message-box').getByRole('button', { name: '删除', exact: true }).click()
  await expect(page.getByText('暂无收款条件', { exact: true })).toBeVisible()
  expect(deletes).toEqual([['condition-1', 'condition-2']])
  expect(saves[0]).toMatchObject({ id: null, code: 'QA-TERM-1', dueDays: 30 })
  await expect(page.locator('.el-message')).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('conditions-deleted.png'), fullPage: true })
})

test('收款条件删除重读缺少所选记录时停止，不能跳过未核验记录', async ({ page }) => {
  let checks = 0
  let deletes = 0
  const records = [1, 2].map((index) => ({
    id: `condition-${index}`,
    condition_code: `QA-TERM-${index}`,
    name: `验收账期${index}`,
    due_days: index * 30,
    is_enabled: true
  }))
  await page.route('**/rest/v1/**', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1)
    const body = route.request().postDataJSON()
    if (name === 'fms_receivable_workspace_secure')
      return route.fulfill({
        json: {
          records: body.p_query?.ids ? records.slice(0, 1) : records,
          total: body.p_query?.ids ? 1 : 2
        }
      })
    if (name === 'fms_ar_delete_dependencies_secure') checks++
    if (name === 'fms_delete_ar_records_secure') deletes++
    return route.fulfill({ json: [] })
  })
  await page.goto('/tests/e2e/fixtures/receivable-workspace.html?kind=condition')
  await page.locator('.el-table__header-wrapper label.el-checkbox').first().click()
  await page.getByRole('button', { name: '批量删除', exact: true }).click()
  await expect(page.locator('.el-message--error')).toContainText('所选收款条件已变化')
  await expect(page.locator('.el-message-box')).toHaveCount(0)
  expect(checks).toBe(0)
  expect(deletes).toBe(0)
})
