import { expect, test } from '@playwright/test'
import { installFixtures, meta, tenantId } from './support/inventory-fixtures'
import { mockApplicationMenus } from './support/menu-rpc'

test.use({ storageState: { cookies: [], origins: [] } })

for (const scenario of [
  {
    kind: 'issue',
    path: 'production-issue',
    name: 'WmsProductionIssue',
    title: '生产领料单',
    push: '出库'
  },
  {
    kind: 'return',
    path: 'production-return',
    name: 'WmsProductionReturn',
    title: '生产退料单',
    push: '退库'
  },
  {
    kind: 'finished_inbound',
    path: 'finished-inbound',
    name: 'WmsFinishedInbound',
    title: '完工入库单',
    push: '入库过账'
  },
  {
    kind: 'finished_return',
    path: 'finished-return',
    name: 'WmsFinishedReturn',
    title: '完工退库单',
    push: '退库过账'
  }
]) {
  test(`${scenario.title}两张单据提交审核下推失败重试`, async ({ page }, testInfo) => {
    test.setTimeout(240_000)
    await installFixtures(page)
    const path = `/wms/production-inout/${scenario.path}`
    const menu = {
      id: 'production-flow-menu',
      parentId: null,
      name: scenario.name,
      path,
      component: path,
      type: 'menu',
      sort: 1,
      meta: meta(scenario.title)
    }
    await page.route('**/rpc/get_accessible_applications', (route) =>
      route.fulfill({
        json: [
          { code: 'platform', name: '平台', baseUrl: '/' },
          { code: 'wms', name: '仓储', baseUrl: '/wms/' }
        ]
      })
    )
    await mockApplicationMenus(page, {
      wms: [
        menu,
        ...[
          'View',
          'Submit',
          'Approve',
          'Push',
          'Delete',
          'Close',
          'Withdraw',
          'Add',
          'Copy',
          'Edit'
        ].map((action) => ({
          id: `flow-${action}`,
          parentId: menu.id,
          name: `${scenario.name}:${action}`,
          path: '',
          component: '',
          type: 'button',
          sort: 1,
          meta: meta(action)
        }))
      ]
    })
    const states = new Map(
      [1, 2].map((n) => [`flow-doc-${n}`, { status: 'draft', materialStatus: 'pending' }])
    )
    let listReads = 0
    await page.route('**/rest/v1/wms_production_material_list?*', (route) => {
      listReads++
      return route.fulfill({
        json: [1, 2].flatMap((doc) =>
          [1, 2].map((line) => ({
            document_id: `flow-doc-${doc}`,
            line_id: `flow-line-${doc}-${line}`,
            document_no: `FLOW-DOC-${doc}`,
            tenant_id: tenantId,
            kind: scenario.kind,
            status: states.get(`flow-doc-${doc}`)?.status,
            material_status: states.get(`flow-doc-${doc}`)?.materialStatus,
            line_no: line * 10,
            material_code: `FLOW-MAT-${line}`,
            material_description: `流程测试物料${line}`,
            business_date: '2026-10-06',
            requested_quantity:
              scenario.kind === 'return' || scenario.kind === 'finished_return' ? -2 : 2,
            actual_quantity:
              scenario.kind === 'return' || scenario.kind === 'finished_return' ? -2 : 2,
            fulfilled_quantity:
              states.get(`flow-doc-${doc}`)?.materialStatus === 'fulfilled'
                ? scenario.kind === 'return' || scenario.kind === 'finished_return'
                  ? -2
                  : 2
                : 0
          }))
        ),
        headers: { 'content-range': '0-3/4', 'access-control-expose-headers': 'content-range' }
      })
    })
    let rejected = true
    const writes: Array<{ p_document_id: string; p_action?: string; p_line_id?: string | null }> =
      []
    for (const rpc of [
      'wms_change_production_material_status_secure',
      'wms_push_production_material_secure'
    ])
      await page.route(`**/rpc/${rpc}`, (route) => {
        const payload = route.request().postDataJSON()
        writes.push(payload)
        if (rejected)
          return route.fulfill({
            status: 400,
            json: { code: 'P0001', message: '测试生产流程办理失败' }
          })
        const state = states.get(payload.p_document_id)
        if (state) {
          if (payload.p_action)
            state.status = payload.p_action === 'submit' ? 'submitted' : 'approved'
          else state.materialStatus = 'fulfilled'
        }
        return route.fulfill({ json: null })
      })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(`#${path}`)
    await expect(page.getByText('FLOW-DOC-1', { exact: true })).toBeVisible({ timeout: 120_000 })
    for (const doc of [1, 2]) {
      const row = page.locator('.el-table__body tr').filter({ hasText: `FLOW-DOC-${doc}` })
      for (const action of ['提交', '审核', scenario.push]) {
        if (
          action === scenario.push &&
          doc === 1 &&
          (scenario.kind === 'issue' || scenario.kind === 'return')
        ) {
          await row.locator('.el-checkbox').click()
          await expect(page.locator('.art-table-query__selection-bar')).toBeVisible()
          await page.screenshot({
            path: `.artifacts/${scenario.kind}-batch-actions.png`,
            fullPage: true
          })
          const readCount = listReads
          const batchLabel = scenario.kind === 'issue' ? '批量出库' : '批量退库'
          await page.getByRole('button', { name: batchLabel, exact: true }).click()
          const batchConfirmation = page.locator('.el-message-box')
          await batchConfirmation.getByRole('button', { name: '取消', exact: true }).click()
          await expect(batchConfirmation).toBeHidden()
          expect(listReads).toBe(readCount)
          await row.locator('.el-checkbox').click()
        }
        const openAction = async () => {
          await row.getByRole('button', { name: '更多操作', exact: true }).click()
          await page.getByRole('menuitem', { name: action, exact: true }).click()
        }
        rejected = true
        await openAction()
        const confirmation = page.locator('.el-message-box')
        const confirmName =
          action === scenario.push
            ? scenario.kind === 'issue'
              ? '确定出库'
              : scenario.kind === 'return'
                ? '确定退库'
                : '确定过账'
            : `确定${action}`
        const before = writes.length
        await confirmation.getByRole('button', { name: '取消', exact: true }).click()
        expect(writes).toHaveLength(before)
        await openAction()
        await confirmation.getByRole('button', { name: confirmName, exact: true }).click()
        await expect(page.getByText('测试生产流程办理失败', { exact: true }).first()).toBeVisible()
        rejected = false
        await openAction()
        await confirmation.getByRole('button', { name: confirmName, exact: true }).click()
        await expect.poll(() => writes.length).toBe(before + 2)
        expect(writes[before]).toEqual(writes[before + 1])
        expect(writes[before].p_document_id).toBe(`flow-doc-${doc}`)
        if (action === scenario.push) expect(writes[before].p_line_id).toBeNull()
        await expect(
          row.getByText(action === '提交' ? '已提交' : '已审核', { exact: true })
        ).toBeVisible()
      }
      await row.getByRole('button', { name: '更多操作', exact: true }).click()
      await expect(page.getByRole('menuitem', { name: scenario.push, exact: true })).toHaveCount(0)
      await page.getByRole('heading', { name: scenario.title, exact: true }).click()
    }
    expect(writes).toHaveLength(12)
    const firstState = states.get('flow-doc-1')
    if (firstState) firstState.materialStatus = 'pending'
    await page.locator('.el-radio-button').filter({ hasText: '按明细' }).click()
    await expect(page.getByRole('columnheader', { name: '物料编码', exact: true })).toBeVisible()
    const lineRow = page
      .locator('.el-table__body tr')
      .filter({ hasText: 'FLOW-DOC-1' })
      .filter({ hasText: 'FLOW-MAT-1' })
    await lineRow.getByRole('button', { name: '更多操作', exact: true }).click()
    await page
      .getByRole('menuitem', {
        name: scenario.push,
        exact: true
      })
      .click()
    await page
      .locator('.el-message-box')
      .getByRole('button', {
        name:
          scenario.kind === 'issue'
            ? '确定出库'
            : scenario.kind === 'return'
              ? '确定退库'
              : '确定过账',
        exact: true
      })
      .click()
    await expect.poll(() => writes.length).toBe(13)
    expect(writes[12]).toEqual({ p_document_id: 'flow-doc-1', p_line_id: 'flow-line-1-1' })
    await page.locator('.el-radio-button').filter({ hasText: '按单据' }).click()
    await expect(page.getByRole('columnheader', { name: '物料编码', exact: true })).toHaveCount(0)
    const header = page.locator('.business-workspace-header')
    const table = page.locator('.art-table-query')
    const enterFocus = async () => {
      await page.getByRole('switch', { name: '进入专注模式', exact: true }).locator('..').click()
      await expect(header).toBeHidden()
      await expect(table).toHaveClass(/is-focus-mode/)
    }
    await enterFocus()
    await page.screenshot({
      path: testInfo.outputPath('production-workflow-focus.png'),
      animations: 'disabled'
    })
    await page.keyboard.press('Escape')
    await expect(header).toBeVisible()
    await expect(table).not.toHaveClass(/is-focus-mode/)
    await enterFocus()
    await table.getByRole('button', { name: '退出专注模式', exact: true }).click()
    await expect(header).toBeVisible()
    await expect(table).not.toHaveClass(/is-focus-mode/)
    expect(errors).toEqual([])
    await page.screenshot({
      path: testInfo.outputPath('production-workflow-completed.png'),
      animations: 'disabled'
    })
  })
}
