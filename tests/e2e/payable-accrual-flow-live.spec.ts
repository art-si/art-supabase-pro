import assert from 'node:assert/strict'
import { expect, test, type Locator, type Page } from '@playwright/test'
import {
  acceptanceIdentifier,
  acceptanceRecord,
  acceptanceRows,
  acceptanceRpc,
  assertPayableAcceptanceSession,
  payableAcceptanceTenantId
} from './support/payable-live-session'
import { captureBusinessEvidence } from './support/capture-business-evidence'
import { prepareAppearance } from './support/appearance'
import { WMS_PURCHASE_INBOUND_PATH } from '../../src/router/business-paths'

const enabled =
  process.env.E2E_PAYABLE_LIVE === 'true' && process.env.E2E_PAYABLE_ACCRUAL_FLOW === 'true'

test.use({
  storageState: enabled
    ? process.env.E2E_AUTH_STATE_FILE || '.artifacts/qa-payable-wms.storage.json'
    : { cookies: [], origins: [] },
  actionTimeout: 30_000
})
test.setTimeout(360_000)

async function selectOption(page: Page, control: Locator, option: string): Promise<void> {
  await control.click()
  await page.getByRole('option', { name: option, exact: true }).click()
}

test('两条真实采购入库审核贯通默认草稿与授权自动审核暂估', async ({ page, context }, info) => {
  test.skip(!enabled, '仅显式执行独立租户的实际库存验收')
  const client = await assertPayableAcceptanceSession(context)
  const materials = await client
    .from('mdm_material')
    .select('id,inventory_unit_id')
    .eq('tenant_id', payableAcceptanceTenantId)
    .in('material_code', ['QA_AP_MAT_1', 'QA_AP_MAT_2'])
  expect(materials.error).toBeNull()
  expect(acceptanceRows(materials.data)).toHaveLength(2)
  const units = await client
    .from('mdm_unit_of_measure')
    .select('id')
    .eq('tenant_id', payableAcceptanceTenantId)
    .eq('id', '22e389b8-a58d-4fc9-8689-e6fb785d598f')
  expect(units.error).toBeNull()
  expect(acceptanceRows(units.data)).toHaveLength(1)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await prepareAppearance(page, { theme: 'light', boxBorderMode: true })
  const policies = acceptanceRows(
    acceptanceRecord(
      acceptanceRecord(
        await acceptanceRpc(client, 'fms_payable_accrual_workspace_secure', {
          p_query: { keyword: 'QA_AUTO_UI_' }
        })
      ).configurations
    ).data
  )
  expect(policies).toHaveLength(2)
  const activated: Array<Record<string, unknown>> = []
  try {
    for (const index of [1, 2]) {
      const policy = policies.find((row) => row.code === `QA_AUTO_UI_${index}`)
      assert.ok(policy && typeof policy.organization_id === 'string')
      expect(policy.tenant_id).toBe(payableAcceptanceTenantId)
      await acceptanceRpc(client, 'fms_save_payable_accrual_policy_secure', {
        p_policy: { ...policy, enabled: true, auto_approve: index === 2 }
      })
      activated.push(policy)
      await page.goto(`#${WMS_PURCHASE_INBOUND_PATH}`, { waitUntil: 'domcontentloaded' })
      await expect(page.getByRole('heading', { name: '采购入库单', exact: true })).toBeVisible()
      const guide = page.getByRole('button', { name: '知道了', exact: true })
      if (await guide.isVisible()) await guide.click()
      const marker = `QA_AUTO_STOCK_${index}`
      const existing = await client
        .from('wms_purchase_document')
        .select('id,document_no,status')
        .eq('tenant_id', payableAcceptanceTenantId)
        .eq('remark', marker)
      expect(existing.error).toBeNull()
      const existingRows = acceptanceRows(existing.data)
      expect(existingRows.length).toBeLessThanOrEqual(1)
      const reusedSource = existingRows.length === 1
      let source = existingRows[0]
      if (!source) {
        await page.getByRole('button', { name: '新增采购入库单', exact: true }).click()
        const drawer = page.getByRole('dialog', { name: '新增采购入库单', exact: true })
        await expect(drawer).toBeVisible()
        const organizationName =
          index === 1 ? '应付管理集成验收 · ROOT' : '自动暂估验收组织2 · QA_AUTO_ORG_2'
        await selectOption(
          page,
          drawer.getByRole('combobox', { name: /库存组织$/ }),
          organizationName
        )
        await selectOption(
          page,
          drawer.getByRole('combobox', { name: /单据类型$/ }),
          '验收标准采购入库'
        )
        await selectOption(
          page,
          drawer.getByRole('combobox', { name: /业务类型$/ }),
          '验收采购入库'
        )
        await selectOption(
          page,
          drawer.getByRole('combobox', { name: /仓库$/ }),
          `自动暂估验收仓库${index} · QA_AUTO_WH_${index}`
        )
        await drawer.getByPlaceholder('从采购主数据选择').click()
        const supplierPicker = page.getByRole('dialog', { name: '选择供应商', exact: true })
        await supplierPicker
          .locator('.el-table__body-wrapper tbody tr')
          .filter({ hasText: `验收虚构供应商${index}` })
          .getByRole('checkbox')
          .locator('..')
          .click()
        await supplierPicker.getByRole('button', { name: '确定', exact: true }).click()
        await drawer.getByRole('textbox', { name: /备注$/ }).fill(marker)
        await drawer.getByRole('button', { name: '添加物料', exact: true }).click()
        const materialPicker = page.getByRole('dialog', { name: '选择采购物料', exact: true })
        await materialPicker
          .locator('.el-table__body-wrapper tbody tr')
          .filter({ hasText: `QA_AP_MAT_${index}` })
          .getByRole('checkbox')
          .locator('..')
          .click()
        await materialPicker.getByRole('button', { name: '确定', exact: true }).click()
        const line = drawer.locator('.wms-editable-line-table .el-table__body-wrapper tbody tr')
        await expect(line).toHaveCount(1)
        await line.getByRole('spinbutton').nth(0).fill(String(index))
        await line.getByRole('spinbutton').nth(0).press('Tab')
        await line.getByRole('spinbutton').nth(1).fill('100')
        await line.getByRole('spinbutton').nth(1).press('Tab')
        await expect(page.locator('.el-message:visible')).toHaveCount(0)
        await captureBusinessEvidence(drawer, {
          path: info.outputPath(`accrual-stock-create-${index}.png`)
        })
        const saved = page.waitForResponse(
          (response) =>
            response.url().endsWith('/rpc/wms_save_purchase_document_secure') &&
            response.request().postDataJSON()?.p_payload?.remark === marker
        )
        await drawer.getByRole('button', { name: '保存', exact: true }).click()
        const result = await saved
        expect(result.ok()).toBe(true)
        const sourceId: unknown = await result.json()
        assert.ok(typeof sourceId === 'string')
        await expect(drawer).toBeHidden()
        const read = await client
          .from('wms_purchase_document')
          .select('id,document_no,status')
          .eq('id', sourceId)
          .single()
        expect(read.error).toBeNull()
        source = acceptanceRecord(read.data)
      }
      const sourceId = acceptanceIdentifier(source)
      assert.ok(typeof source.document_no === 'string')
      const row = page
        .locator('.art-table-query .el-table__body-wrapper tbody tr')
        .filter({ hasText: source.document_no })
      for (const [action, menuLabel, confirmLabel] of [
        ['submit', '提交单据', '确定提交'],
        ['approve', '审核单据', '确定审核']
      ]) {
        if (source.status === 'approved' || (action === 'submit' && source.status === 'submitted'))
          continue
        await row.getByRole('button', { name: '更多操作', exact: true }).click()
        await page.getByRole('menuitem', { name: menuLabel, exact: true }).click()
        const acted = page.waitForResponse(
          (response) =>
            response.url().endsWith('/rpc/wms_change_purchase_document_status_secure') &&
            response.request().postDataJSON()?.p_document_id === sourceId &&
            response.request().postDataJSON()?.p_action === action
        )
        await page
          .locator('.el-message-box')
          .getByRole('button', { name: confirmLabel, exact: true })
          .click()
        const result = await acted
        expect(result.ok()).toBe(true)
        await result.finished()
        await expect(row).toContainText(action === 'submit' ? '已提交' : '已审核')
      }
      const generated = await client
        .from('fms_payable_accrual_run')
        .select('payable_document_id,triggered_by,executed_by,policy_version,policy_snapshot')
        .eq('source_document_id', sourceId)
      expect(generated.error).toBeNull()
      const runs = acceptanceRows(generated.data)
      expect(runs).toHaveLength(1)
      const run = runs[0]
      expect(run.triggered_by).toBe('a9eeb9b7-e474-43e3-9cc2-c2f46c0f0ec3')
      expect(run.executed_by).toBe(run.triggered_by)
      expect(acceptanceRecord(run.policy_snapshot).auto_approve).toBe(index === 2)
      assert.ok(typeof run.payable_document_id === 'string')
      const payable = acceptanceRecord(
        acceptanceRows(
          acceptanceRecord(
            await acceptanceRpc(client, 'fms_purchase_payable_list_secure', {
              p_kind: 'estimated',
              p_id: run.payable_document_id
            })
          ).data
        )[0]
      )
      expect(payable.source_document_id).toBe(sourceId)
      expect(payable.total_amount).toBe(113 * index)
      expect(payable.account_set_id).toBe('cf3eeddd-49b0-4e62-97a9-cab2769cb633')
      if (!reusedSource || index === 2)
        expect(payable.status).toBe(index === 1 ? 'draft' : 'approved')
      else expect(['draft', 'submitted', 'approved']).toContain(payable.status)
      if (index === 1 && payable.status !== 'approved') {
        if (payable.status === 'draft')
          await acceptanceRpc(client, 'fms_act_purchase_payable_secure', {
            p_ids: [run.payable_document_id],
            p_action: 'submit'
          })
        await acceptanceRpc(client, 'fms_act_purchase_payable_secure', {
          p_ids: [run.payable_document_id],
          p_action: 'approve'
        })
      }
      await expect(page.locator('.el-message:visible')).toHaveCount(0)
      await captureBusinessEvidence(page, {
        path: info.outputPath(`accrual-stock-approved-${index}.png`),
        fullPage: true
      })
    }
    expect(errors).toEqual([])
  } finally {
    const current = acceptanceRows(
      acceptanceRecord(
        acceptanceRecord(
          await acceptanceRpc(client, 'fms_payable_accrual_workspace_secure', {
            p_query: { keyword: 'QA_AUTO_UI_' }
          })
        ).configurations
      ).data
    )
    for (const policy of current.filter((row) =>
      activated.some((original) => original.id === row.id)
    ))
      await acceptanceRpc(client, 'fms_save_payable_accrual_policy_secure', {
        p_policy: { ...policy, enabled: false }
      })
  }
})
