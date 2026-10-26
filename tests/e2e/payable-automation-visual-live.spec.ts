import assert from 'node:assert/strict'
import { expect, test } from '@playwright/test'
import {
  assertPayableAcceptanceSession,
  acceptanceRecord as record,
  acceptanceRows as rows,
  acceptanceRpc as rpc
} from './support/payable-live-session'
import { prepareAppearance } from './support/appearance'
import { captureBusinessEvidence } from './support/capture-business-evidence'

const enabled = process.env.E2E_PAYABLE_LIVE === 'true'
test.use({
  storageState: enabled
    ? process.env.E2E_AUTH_STATE_FILE || '.artifacts/qa-payable-real.storage.json'
    : { cookies: [], origins: [] },
  trace: 'off'
})
test.skip(!enabled, '仅显式读取独立验收租户的真实后台核销结果')
test.setTimeout(240_000)

test('两套真实后台配置、历史保护及核销结果视觉验收', async ({ page, context }, info) => {
  const client = await assertPayableAcceptanceSession(context)
  const metadata = record(
    await rpc(client, 'fms_payable_automation_workspace_secure', {
      p_query: { size: 100 }
    })
  )
  const configurations = rows(record(metadata.configurations).data).filter((row) =>
    String(row.name).startsWith('独立后台核销')
  )
  expect(configurations).toHaveLength(2)
  expect(configurations.every((row) => row.enabled === false)).toBe(true)
  await prepareAppearance(page, {
    theme: info.project.name.includes('dark') ? 'dark' : 'light',
    boxBorderMode: !info.project.name.includes('shadow')
  })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`#/fms/accounts-payable/writeoff?automationId=${configurations[0].id}`, {
    waitUntil: 'domcontentloaded'
  })
  const workspace = page.getByRole('dialog', { name: '后台自动核销', exact: true })
  await expect(workspace).toBeVisible({ timeout: 60_000 })
  await workspace.getByRole('button', { name: '清除任务范围', exact: true }).click()
  for (const configuration of configurations)
    await expect(
      workspace.locator('tbody tr').filter({ hasText: String(configuration.name) })
    ).toContainText('否')
  await captureBusinessEvidence(workspace, {
    path: info.outputPath('background-real-configurations.png')
  })
  for (const configuration of configurations) {
    const key = String(configuration.name).includes('CNY') ? 'CNY' : 'FX'
    const row = workspace.locator('tbody tr').filter({ hasText: String(configuration.name) })
    await row.getByRole('button', { name: '编辑后台配置', exact: true }).click()
    const editor = page.getByRole('dialog', { name: '编辑后台核销配置', exact: true })
    await expect(editor.getByRole('combobox', { name: /核销方案$/ })).toBeDisabled()
    await expect(editor.getByRole('combobox', { name: /核算账套$/ })).toBeDisabled()
    await captureBusinessEvidence(editor, { path: info.outputPath(`background-${key}-editor.png`) })
    await editor
      .getByText(
        key === 'CNY' ? '币种 等于 币种（空值不匹配）' : '往来单位 等于 往来单位（空值不匹配）',
        { exact: true }
      )
      .scrollIntoViewIfNeeded()
    if (key === 'FX')
      await editor
        .getByRole('alert')
        .filter({ hasText: '异币双方可用余量将全部对冲' })
        .scrollIntoViewIfNeeded()
    await captureBusinessEvidence(editor, {
      path: info.outputPath(`background-${key}-conditions.png`)
    })
    await editor.getByRole('button', { name: '取消', exact: true }).click()
    await row.getByRole('button', { name: '删除后台配置', exact: true }).click()
    const guard = page.getByRole('dialog', { name: '暂时无法删除后台核销配置', exact: true })
    await expect(guard).toContainText('APHXHT-')
    await captureBusinessEvidence(guard, {
      path: info.outputPath(`background-${key}-history-guard.png`)
    })
    const referencedJobNo = await guard
      .locator('.master-delete-guard__record strong')
      .first()
      .textContent()
    assert.ok(referencedJobNo)
    const referencedJob = rows(record(metadata.jobs).data).find(
      (job) => job.job_no === referencedJobNo.trim()
    )
    assert.ok(referencedJob)
    const navigationReady = page.waitForResponse(
      (response) =>
        response.url().endsWith('/rpc/fms_payable_automation_workspace_secure') &&
        response.request().postDataJSON()?.p_query?.job_id === referencedJob.id,
      { timeout: 30_000 }
    )
    await guard.getByRole('button', { name: '查看关联', exact: true }).first().click()
    const navigationResponse = await navigationReady
    expect(navigationResponse.ok()).toBe(true)
    expect(record(record(await navigationResponse.json()).jobs).total).toBe(1)
    await expect(guard).not.toBeVisible()
    await expect(page).toHaveURL(/automationJobId=/)
    await expect(page).not.toHaveURL(/[?&]recordId=/)
    await expect(workspace.locator('.el-table__body-wrapper tbody tr')).toHaveCount(1)
    await expect(workspace.locator('tbody tr').filter({ hasText: referencedJobNo })).toHaveCount(1)
    await captureBusinessEvidence(workspace, {
      path: info.outputPath(`background-${key}-reference-navigation.png`)
    })
    await workspace.getByRole('tab', { name: '后台配置', exact: true }).click()
    await workspace.getByRole('button', { name: '清除任务范围', exact: true }).click()
    await row.getByRole('button', { name: '查看后台任务', exact: true }).click()
    const jobs = record(
      await rpc(client, 'fms_payable_automation_workspace_secure', {
        p_query: { automation_id: configuration.id, size: 100 }
      })
    )
    const completed = rows(record(jobs.jobs).data).find((job) => Number(job.record_count) > 0)
    assert.ok(completed)
    const jobRow = workspace.locator('tbody tr').filter({ hasText: String(completed.job_no) })
    await expect(jobRow.getByRole('button', { name: '重试后台任务', exact: true })).toBeDisabled()
    await captureBusinessEvidence(workspace, {
      path: info.outputPath(`background-${key}-real-jobs.png`)
    })
    await jobRow.getByRole('button', { name: '查看核销结果', exact: true }).click()
    const results = page.getByRole('dialog', { name: '后台任务核销记录', exact: true })
    await expect(results.locator('tbody tr')).toContainText('已核销')
    await results.getByRole('button', { name: '联查核销记录', exact: true }).click()
    const detail = page.getByRole('dialog', { name: '应付核销单', exact: true })
    await expect(detail).toContainText('转-202610-')
    if (key === 'FX') {
      await expect(detail).toContainText('USD')
      await expect(detail).toContainText('EUR')
      await expect(detail).toContainText('损失 ¥20.00')
    }
    await captureBusinessEvidence(detail, {
      path: info.outputPath(`background-${key}-real-result.png`)
    })
    await detail.getByRole('button', { name: '关闭此对话框', exact: true }).click()
    await results.getByRole('button', { name: '关闭此对话框', exact: true }).click()
    await workspace.getByRole('tab', { name: '后台配置', exact: true }).click()
    await workspace.getByRole('button', { name: '清除任务范围', exact: true }).click()
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(errors).toEqual([])
})
