import { expect, test, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

const tenantId = '11111111-1111-4111-8111-111111111111'
const groupId = '22222222-2222-4222-8222-222222222222'
const id = '33333333-3333-4333-8333-333333333333'
const referenceId = '44444444-4444-4444-8444-444444444444'
const sourcePath = `${tenantId}/${groupId}/source/${id}-source.png`
const item = {
  rowNo: 1,
  name: '验收折弯件',
  widthMm: 180,
  lengthM: 2.5,
  quantity: 3,
  materialColor: '镀锌板',
  remark: '按图加工',
  sketch: null
}
const image = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=',
  'base64'
)

async function openWorkspace(page: Page, theme = 'light') {
  await prepareIsolatedSession(page)
  const state = {
    recognizeCount: 0,
    saveCount: 0,
    failRecognition: false,
    failSave: false,
    payloads: [] as Record<string, unknown>[],
    historyFailure: false,
    historyFilters: [] as (string | null)[]
  }
  const lists: Record<string, unknown>[] = []
  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url())
    const table = url.pathname.split('/').at(-1)
    let rows: unknown[] = []
    if (table === 'sys_tenant')
      rows = [
        {
          id: tenantId,
          tenantCode: 'TEST',
          tenantName: '验收租户',
          builtinType: 'business',
          tenant_code: 'TEST',
          tenant_name: '验收租户'
        }
      ]
    if (table === 'mdm_accessory_processing_list') rows = lists
    if (table === 'mdm_material_category')
      rows = [
        {
          id: referenceId,
          tenantId,
          categoryName: '配件',
          categoryCode: 'B59',
          parentId: null,
          status: 'enabled'
        }
      ]
    if (table === 'mdm_material_type')
      rows = [{ id: referenceId, typeName: '半成品', status: 'enabled' }]
    if (table === 'mdm_unit_of_measure')
      rows = [{ id: referenceId, unitCode: 'PC', unitName: '件', symbol: 'PC', status: 'enabled' }]
    if (table === 'ai_artifact_review') {
      state.historyFilters.push(
        route.request().headers()['x-art-tenant-scope'] ?? url.searchParams.get('tenant_id')
      )
      if (state.historyFailure)
        return route.fulfill({ status: 503, json: { message: 'history unavailable' } })
      rows = [
        {
          id,
          tenantId,
          createTime: '2026-10-31T08:00:00Z',
          proposedPayload: { projectName: '历史项目', drawingName: '历史图纸', items: [item] },
          metadata: {
            imageUrls: [
              `https://example.invalid/storage/v1/object/sign/mdm-accessory-processing/${tenantId}/${groupId}/page/page.png?token=test`
            ]
          },
          confidence: 0.95,
          warnings: []
        }
      ]
    }
    if (table === 'mdm_save_accessory_processing_draft') {
      state.saveCount++
      const payload = route.request().postDataJSON().p_payload as Record<string, unknown>
      state.payloads.push(payload)
      if (state.failSave)
        return route.fulfill({ status: 503, json: { message: 'save unavailable' } })
      lists.splice(0, lists.length, {
        ...payload,
        id,
        status: 'draft',
        createTime: '2026-10-31T08:00:00Z',
        items: (payload.items as object[]).map((value) => ({ ...value, id }))
      })
      return route.fulfill({ json: id })
    }
    return route.fulfill({
      headers: {
        'content-range': rows.length ? `0-${rows.length - 1}/${rows.length}` : '*/0',
        'access-control-expose-headers': 'content-range'
      },
      json: rows
    })
  })
  await page.route('**/storage/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.includes('/object/list/')) {
      const prefix = route.request().postDataJSON().prefix as string
      return route.fulfill({
        json: prefix.endsWith('/source') ? [{ name: `${id}-source.png`, id }] : []
      })
    }
    if (path.includes('/object/sign/'))
      return route.fulfill({ json: { signedURL: `${path.replace('/storage/v1', '')}?token=test` } })
    if (route.request().method() === 'POST')
      return route.fulfill({ json: { Key: path.split('/object/')[1] } })
    return route.fulfill({ contentType: 'image/png', body: image })
  })
  await page.route('**/functions/v1/ai-accessory-processing-ocr', (route) => {
    state.recognizeCount++
    if (state.failRecognition)
      return route.fulfill({ status: 503, json: { message: '识别服务暂不可用，请重试' } })
    return route.fulfill({
      json: {
        rawText: '验收',
        projectName: '识别项目',
        drawingName: '加工图纸',
        confidence: 0.95,
        warnings: ['第 1 行展宽待核对'],
        items: [{ ...item, widthMm: null }],
        artifactId: id
      }
    })
  })
  await page.goto(`/tests/e2e/fixtures/accessory-recognition-tabs.html?theme=${theme}`)
  await page.getByRole('button', { name: 'AI 识别', exact: true }).click()
  const dialog = page.getByRole('dialog').filter({ has: page.locator('.accessory-recognition') })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('tab', { name: '记录与草稿', exact: true }).click()
  await dialog.getByRole('button', { name: '刷新记录', exact: true }).click()
  await expect.poll(() => state.historyFilters.at(-1)).toBe(tenantId)
  await dialog.getByRole('tab', { name: '上传与识别', exact: true }).click()
  await expect(dialog.getByRole('tab')).toHaveCount(3)
  await expect(dialog.getByRole('tab', { name: '上传与识别', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  return { dialog, state, lists }
}

test('真实弹窗上传失败重试、跨页签校验定位与保存重试', async ({ page }, info) => {
  test.setTimeout(90_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const { dialog, state } = await openWorkspace(page)
  const uploadImage = Buffer.from(
    await page.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = 80
      canvas.height = 80
      const context = canvas.getContext('2d')!
      context.fillStyle = '#fff'
      context.fillRect(0, 0, 80, 80)
      context.fillStyle = '#222'
      context.fillText('加工清单', 4, 20)
      return canvas.toDataURL('image/png').split(',')[1]!
    }),
    'base64'
  )
  await dialog
    .locator('input[type="file"]')
    .first()
    .setInputFiles({ name: 'processing.png', mimeType: 'image/png', buffer: uploadImage })
  const recognize = dialog.getByRole('button', { name: '识别清单内容', exact: true })
  await expect(recognize).toBeEnabled()
  state.failRecognition = true
  await recognize.click()
  await expect(dialog.getByRole('tab', { name: '结果校对', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await expect(dialog.getByText('清单识别未完成', { exact: true })).toBeVisible()
  state.failRecognition = false
  await dialog.getByRole('button', { name: '重新识别', exact: true }).click()
  await expect(dialog.getByText('清单归属', { exact: true })).toBeVisible()
  await expect(dialog.locator('.art-form .art-async-state[aria-busy="true"]')).toHaveCount(0)
  const project = dialog.locator('[data-art-form-item-key="projectName"] input')
  await project.fill('')
  await dialog.getByRole('tab', { name: '记录与草稿', exact: true }).click()
  const save = dialog.getByRole('button', { name: '确认并保存清单', exact: true })
  await save.click()
  await expect(dialog.getByRole('tab', { name: '结果校对', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await expect(project).toBeFocused()
  await expect(dialog.locator('[data-art-form-item-key="projectName"] .el-form-item')).toHaveClass(
    /is-error/
  )
  await project.fill('保存验收项目')
  await dialog.getByRole('tab', { name: '上传与识别', exact: true }).click()
  await save.click()
  const width = dialog.locator('[data-art-form-item-key="widthMm"] input')
  await expect(width).toBeVisible()
  await expect(width).toBeFocused()
  await expect(dialog.locator('[data-art-form-item-key="widthMm"] .el-form-item')).toHaveClass(
    /is-error/
  )
  expect(state.saveCount).toBe(0)
  await dialog.screenshot({ path: info.outputPath('invalid-row.png'), timeout: 60_000 })
  await width.fill('180')
  await width.press('Tab')
  state.failSave = true
  await save.click()
  await expect(page.getByText('加工清单保存失败，请检查内容后重试', { exact: true })).toBeVisible()
  await expect(project).toHaveValue('保存验收项目')
  await expect(width).toHaveValue('180.0')
  state.failSave = false
  await save.click()
  await expect.poll(() => state.saveCount).toBe(2)
  await expect(
    page.getByText('配件加工清单已保存，可在主列表逐件查看', { exact: true })
  ).toBeVisible()
  expect(state.payloads[1]).toMatchObject({
    tenantId,
    mode: 'SaveDraft',
    projectName: '保存验收项目',
    items: [
      {
        name: item.name,
        widthMm: 180,
        lengthM: 2.5,
        quantity: 3,
        baseUnitId: referenceId,
        materialTypeId: referenceId,
        categoryId: referenceId
      }
    ]
  })
  await dialog.getByRole('tab', { name: '记录与草稿', exact: true }).click()
  await expect(
    dialog.getByRole('button', { name: `打开${item.name}所在清单`, exact: true })
  ).toBeVisible()
  expect(state.recognizeCount).toBe(2)
  expect(errors).toEqual([])
})

for (const visual of [
  { theme: 'light', width: 1440, height: 900 },
  { theme: 'dark', width: 390, height: 844 }
]) {
  test(`${visual.theme}${visual.width} 历史草稿切换保持状态与全部页签视觉`, async ({
    page
  }, info) => {
    await page.setViewportSize(visual)
    const { dialog, state } = await openWorkspace(page, visual.theme)
    await dialog.screenshot({ path: info.outputPath('upload.png'), timeout: 60_000 })
    await dialog.getByRole('tab', { name: '记录与草稿', exact: true }).click()
    state.historyFailure = true
    await dialog.getByRole('button', { name: '刷新记录', exact: true }).click()
    await expect(dialog.getByText('识别记录加载失败，请重试', { exact: true })).toBeVisible()
    state.historyFailure = false
    await dialog.getByRole('button', { name: '重新加载', exact: true }).click()
    await dialog.getByRole('button', { name: /历史项目/ }).click()
    await expect(dialog.getByRole('tab', { name: '结果校对', exact: true })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    await expect(dialog.locator('[data-art-form-item-key="projectName"] input')).toHaveValue(
      '历史项目'
    )
    await dialog.getByRole('tab', { name: '上传与识别', exact: true }).click()
    await expect(dialog.getByText('识别原件.png', { exact: true })).toBeVisible()
    await dialog.getByRole('tab', { name: '结果校对', exact: true }).click()
    await expect(dialog.locator('[data-art-form-item-key="projectName"] input')).toHaveValue(
      '历史项目'
    )
    await dialog.getByRole('button', { name: '确认并保存清单', exact: true }).click()
    await expect.poll(() => state.saveCount).toBe(1)
    expect(state.payloads[0]).toMatchObject({ sourcePath, tenantId })
    await dialog.getByRole('tab', { name: '记录与草稿', exact: true }).click()
    await dialog.getByRole('button', { name: `打开${item.name}所在清单`, exact: true }).click()
    await expect(dialog.getByRole('tab', { name: '结果校对', exact: true })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    for (const tab of ['上传与识别', '结果校对', '记录与草稿']) {
      await dialog.getByRole('tab', { name: tab, exact: true }).click()
      expect(
        await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
      ).toBe(true)
      await dialog.screenshot({
        path: info.outputPath(`${tab}.png`),
        timeout: 60_000,
        animations: 'disabled'
      })
    }
  })
}
