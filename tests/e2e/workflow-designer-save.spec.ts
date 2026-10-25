import { expect, test } from '@playwright/test'
import { createWorkflowTemplateDraft } from '../../src/views/workflow/definition/modules/workflow-templates'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

for (const phase of ['save', 'publish']) {
  test(`发布 ${phase} 请求期间新修改不被覆盖`, async ({ page }) => {
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    let started = false
    let publishes = 0
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.name))
    const config = createWorkflowTemplateDraft('custom').config
    config.nodes[0].assignee = { type: 'users', userIds: ['member-a'] }
    await page.route('**/rest/v1/**', async (route) => {
      const path = new URL(route.request().url()).pathname
      if (
        path.endsWith('/rpc/save_workflow_definition') ||
        path.endsWith('/rpc/publish_workflow_definition')
      ) {
        const publishing = path.endsWith('/rpc/publish_workflow_definition')
        if (publishing) publishes += 1
        if (publishing === (phase === 'publish')) {
          started = true
          await held
        }
        return route.fulfill({
          json: { definitionId: 'definition-a', versionId: 'version-a', versionNo: 1 }
        })
      }
      if (path.endsWith('/wf_definition'))
        return route.fulfill({
          json: {
            id: 'definition-a',
            code: 'draft_test',
            name: '原流程',
            business_type: 'generic',
            tenant_id: 'tenant-a',
            status: 'draft',
            versions: [{ id: 'version-a', version_no: 1, status: 'draft', config }]
          }
        })
      const data = path.endsWith('/sys_user')
        ? [{ id: 'member-a', user_name: '审批成员 A', user_email: 'test@example.invalid' }]
        : path.endsWith('/sys_tenant')
          ? [{ id: 'tenant-a', tenant_code: 'test', tenant_name: '测试租户' }]
          : []
      return route.fulfill({
        headers: {
          'content-range': data.length ? '0-0/1' : '*/0',
          'access-control-expose-headers': 'content-range'
        },
        json: data
      })
    })
    await page.goto('/tests/e2e/fixtures/workflow-designer-save.html')
    const name = page.getByRole('textbox', { name: /流程名称/ })
    await expect(name).toHaveValue('原流程')
    await page.getByRole('button', { name: '发布新版', exact: true }).click()
    await page
      .locator('.el-message-box')
      .getByRole('button', { name: '保存并发布', exact: true })
      .click()
    await expect.poll(() => started).toBe(true)
    await name.fill('请求期间的新修改')
    release()
    await expect(page.locator('.el-message--warning')).toContainText(
      phase === 'save' ? '重新核验后发布' : '新修改尚未保存'
    )
    await expect(name).toHaveValue('请求期间的新修改')
    expect(publishes).toBe(phase === 'save' ? 0 : 1)
    expect(errors).toEqual([])
  })
}

test('设计器审批对象读取失败零写入且重试保留草稿', async ({ page }, testInfo) => {
  let failed = true
  let writes = 0
  let writeFailed = false
  let refreshFailed = false
  let savedName = '原流程'
  const errors: string[] = []
  const canvasWarnings: string[] = []
  page.on('pageerror', (error) => errors.push(error.name))
  page.on('console', (message) => {
    if (message.type() === 'warning' && message.text().includes('[Vue Flow]'))
      canvasWarnings.push(message.text())
  })
  const config = createWorkflowTemplateDraft('custom').config
  config.nodes[0].assignee = { type: 'users', userIds: ['member-a'] }
  await page.route('**/rest/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/rpc/save_workflow_definition')) {
      writes += 1
      if (writeFailed)
        return route.fulfill({
          status: 503,
          json: { code: 'XX000', message: 'synthetic write failure' }
        })
      const payload = route.request().postDataJSON().p_definition
      expect(payload.tenantId).toBe('tenant-a')
      expect(payload.config.nodes[0].assignee.userIds).toEqual(['member-a'])
      savedName = payload.name
      return route.fulfill({
        json: { definitionId: 'definition-a', versionId: 'version-a', versionNo: 1 }
      })
    }
    if (path.endsWith('/wf_definition')) {
      if (refreshFailed)
        return route.fulfill({
          status: 503,
          json: { code: 'XX000', message: 'synthetic refresh failure' }
        })
      return route.fulfill({
        json: {
          id: 'definition-a',
          code: 'draft_test',
          name: savedName,
          business_type: 'generic',
          tenant_id: 'tenant-a',
          status: 'draft',
          versions: [{ id: 'version-a', version_no: 1, status: 'draft', config }]
        }
      })
    }
    if (path.endsWith('/sys_user') && failed) {
      return route.fulfill({
        status: 503,
        json: { code: 'XX000', message: 'synthetic option failure' }
      })
    }
    const data = path.endsWith('/sys_user')
      ? [{ id: 'member-a', user_name: '审批成员 A', user_email: 'test@example.invalid' }]
      : path.endsWith('/sys_tenant')
        ? [{ id: 'tenant-a', tenant_code: 'test', tenant_name: '测试租户' }]
        : []
    return route.fulfill({
      headers: {
        'content-range': data.length ? '0-0/1' : '*/0',
        'access-control-expose-headers': 'content-range'
      },
      json: data
    })
  })
  await page.goto('/tests/e2e/fixtures/workflow-designer-save.html')
  const name = page.getByRole('textbox', { name: /流程名称/ })
  await expect(name).toHaveValue('原流程')
  await name.fill('保留的流程草稿')
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect(page.getByText('审批对象核验失败', { exact: true })).toBeVisible()
  await expect(name).toHaveValue('保留的流程草稿')
  expect(writes).toBe(0)
  failed = false
  const state = page.locator('.workflow-designer-page__content > .art-async-state')
  await state.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(page.getByText('审批对象核验失败', { exact: true })).not.toBeVisible()
  expect(writes).toBe(0)
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect.poll(() => writes).toBe(1)
  expect(savedName).toBe('保留的流程草稿')
  await page.getByRole('button', { name: '发布新版', exact: true }).click()
  const confirmation = page.locator('.el-message-box')
  await expect(confirmation).toBeVisible()
  await confirmation.getByRole('button', { name: '取消', exact: true }).click()
  await expect(confirmation).not.toBeVisible()
  expect(writes).toBe(1)
  await page.getByRole('button', { name: '发布新版', exact: true }).click()
  await expect(confirmation).toBeVisible()
  await name.evaluate((element) => {
    if (!(element instanceof HTMLInputElement)) throw new Error('Expected name input')
    element.value = '确认期间修改的草稿'
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await confirmation.getByRole('button', { name: '保存并发布', exact: true }).click()
  await expect(page.locator('.el-message--warning')).toContainText('流程内容已变化')
  expect(writes).toBe(1)
  await expect(name).toHaveValue('确认期间修改的草稿')
  const steps = page.locator('.workflow-designer-page__steps')
  await steps.getByRole('button', { name: /流程设计/ }).click()
  await expect(page.locator('.workflow-canvas-editor .vue-flow')).toBeVisible()
  const nodeName = page.getByRole('textbox', { name: /节点名称/ })
  await nodeName.fill('保留的审批节点')
  await steps.getByRole('button', { name: /基础信息/ }).click()
  await expect(page.locator('.workflow-canvas-editor .vue-flow')).not.toBeVisible()
  await steps.getByRole('button', { name: /流程设计/ }).click()
  await expect(nodeName).toHaveValue('保留的审批节点')
  await expect(page.locator('.workflow-canvas-editor .vue-flow')).toBeVisible()
  await page
    .locator('.workflow-canvas-editor')
    .screenshot({ path: testInfo.outputPath('canvas-restored.png') })
  expect(canvasWarnings).toEqual([])
  await steps.getByRole('button', { name: /基础信息/ }).click()
  await name.fill('保存失败仍保留的草稿')
  writeFailed = true
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect(page.locator('.el-message--error')).toHaveCount(1)
  await expect(page.locator('.el-message--error')).toContainText('流程草稿保存失败')
  await expect(name).toHaveValue('保存失败仍保留的草稿')
  expect(writes).toBe(2)
  writeFailed = false
  refreshFailed = true
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect(page.locator('.el-message--warning')).toContainText('草稿已保存，但详情刷新失败')
  await expect(name).toHaveValue('保存失败仍保留的草稿')
  expect(writes).toBe(3)
  expect(errors).toEqual([])
})
