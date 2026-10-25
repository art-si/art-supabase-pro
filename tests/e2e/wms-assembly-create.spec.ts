import { expect, test } from '@playwright/test'
import { installFixtures, meta, tenantId } from './support/inventory-fixtures'
import { mockApplicationMenus } from './support/menu-rpc'
import { prepareAppearance } from './support/appearance'

test.use({ storageState: { cookies: [], origins: [] } })

for (const oldOutcome of ['success', 'failure'] as const) {
  test(`组装详情失败重试及旧${oldOutcome}响应隔离`, async ({ page }, testInfo) => {
    await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
    let release = () => {}
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    let held = false
    let recovered = false
    await page.route('**/rest/v1/wms_assembly_component?*', async (route) => {
      const old = new URL(route.request().url()).searchParams.get('assembly_id') === 'eq.assembly-a'
      if (old) {
        held = true
        await pending
      }
      if ((old && oldOutcome === 'failure') || (!old && !recovered))
        return route.fulfill({ status: 400, json: { code: 'P0001', message: '测试组件读取失败' } })
      await route.fulfill({
        json: [1, 2].map((index) => ({
          id: `${old ? 'old' : 'current'}-${index}`,
          assembly_id: old ? 'assembly-a' : 'assembly-b',
          quantity: index,
          material: {
            material_code: `MAT-${index}`,
            material_name: `${old ? '旧' : '当前'}组装组件${index}`
          },
          sourceBatch: { batch_no: `BATCH-${index}` }
        }))
      })
    })
    await page.goto('/tests/e2e/fixtures/wms-operation-retry.html')
    await page.getByRole('button', { name: '测试组装详情a', exact: true }).click()
    await expect.poll(() => held).toBe(true)
    const drawer = page.getByRole('dialog', { name: '组装单详情', exact: true })
    await drawer.getByRole('button', { name: /关闭|Close/ }).click()
    await page.getByRole('button', { name: '测试组装详情b', exact: true }).click()
    await expect(drawer.getByText('组件明细加载失败，请重试', { exact: true })).toBeVisible()
    await expect(drawer.locator('strong').filter({ hasText: /^—$/ })).toHaveCount(2)
    recovered = true
    await drawer.getByRole('button', { name: '重新加载', exact: true }).click()
    await expect(drawer.getByText('当前组装组件2', { exact: true })).toBeVisible()
    const response = page.waitForResponse(
      (item) =>
        item.url().includes('wms_assembly_component') &&
        new URL(item.url()).searchParams.get('assembly_id') === 'eq.assembly-a'
    )
    release()
    await (await response).finished()
    await expect(drawer.getByText('当前组装组件2', { exact: true })).toBeVisible()
    await expect(drawer.getByText('旧组装组件1', { exact: true })).not.toBeVisible()
    await expect(drawer.getByText('组件明细加载失败，请重试', { exact: true })).not.toBeVisible()
    await drawer.getByText('FINISHED-b', { exact: false }).last().scrollIntoViewIfNeeded()
    await page.screenshot({
      path: testInfo.outputPath('assembly-current-detail.png'),
      animations: 'disabled'
    })
  })
}

for (const entry of ['component', 'menu'] as const) {
  test(`库存组装${entry}两张新增各两批次失败保留并重试`, async ({ page }, testInfo) => {
    test.setTimeout(90_000)
    const payloads: unknown[] = []
    const savedRecords: Record<string, unknown>[] = []
    let failed = true
    if (entry === 'component')
      await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
    else {
      await installFixtures(page)
      await prepareAppearance(page, {
        theme: testInfo.project.name.includes('dark') ? 'dark' : 'light',
        boxBorderMode: !testInfo.project.name.includes('shadow')
      })
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
          {
            id: 'assembly-menu',
            parentId: null,
            name: 'WmsAssembly',
            path: '/wms/adjustment-business/assembly',
            component: '/wms/adjustment-business/assembly',
            type: 'menu',
            sort: 1,
            meta: meta('库存组装')
          },
          ...['View', 'Post'].map((action) => ({
            id: `assembly-${action}`,
            parentId: 'assembly-menu',
            name: `WmsAssembly:${action}`,
            path: '',
            component: '',
            type: 'button',
            sort: 1,
            meta: meta(action)
          }))
        ]
      })
      await page.route('**/rest/v1/wms_assembly_document?*', (route) =>
        route.fulfill({
          json: savedRecords,
          headers: {
            'content-range': `0-${Math.max(0, savedRecords.length - 1)}/${savedRecords.length}`,
            'access-control-expose-headers': 'content-range'
          }
        })
      )
    }
    await page.route('**/rest/v1/wms_inventory_batch?*', (route) =>
      route.fulfill({
        json: [1, 2, 3, 4, 5].map((index) => ({
          id: `batch-${index}`,
          tenant_id: entry === 'component' ? 'tenant-test' : tenantId,
          organization_id: 'source-org',
          warehouse_id: index === 3 ? 'other-warehouse' : 'source-warehouse',
          material_id: `component-${index}`,
          batch_no: `ASSEMBLY-BATCH-${index}`,
          quantity: 10,
          project_id: null,
          construction_no: null,
          owner_type: index === 4 ? 'supplier' : 'self',
          owner_id: index === 4 ? 'other-owner' : null,
          pack_id: null,
          material: { material_name: `组装组件 ${index}`, serial_management_enabled: index === 5 },
          warehouse: { warehouse_name: '测试组装仓库' }
        })),
        headers: { 'content-range': '0-4/5', 'access-control-expose-headers': 'content-range' }
      })
    )
    await page.route('**/rest/v1/mdm_warehouse?*', (route) =>
      route.fulfill({
        json: [
          {
            id: 'source-warehouse',
            tenant_id: entry === 'component' ? 'tenant-test' : tenantId,
            organization_id: 'source-org',
            warehouse_code: 'WH-TEST',
            warehouse_name: '测试组装仓库',
            status: 'enabled',
            enable_locations: true
          }
        ]
      })
    )
    await page.route('**/rest/v1/mdm_warehouse_bin?*', (route) =>
      route.fulfill({
        json: [
          {
            id: 'target-bin',
            bin_code: 'ASSEMBLY-BIN',
            bin_name: '测试成品库位',
            status: 'available'
          }
        ]
      })
    )
    await page.route('**/rest/v1/mdm_material?*', (route) =>
      route.fulfill({
        json: [
          {
            id: 'finished-test',
            material_code: 'FINISHED-001',
            material_name: '测试组装成品',
            serial_management_enabled: false
          }
        ],
        headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' }
      })
    )
    await page.route('**/rest/v1/rpc/wms_post_assembly_secure', (route) => {
      payloads.push(route.request().postDataJSON())
      if (!failed && entry === 'menu')
        savedRecords.push({
          id: `saved-assembly-${savedRecords.length + 1}`,
          tenant_id: tenantId,
          document_no: `SAVED-ASSEMBLY-${savedRecords.length + 1}`,
          warehouse_id: 'source-warehouse',
          organization_id: 'source-org',
          project_id: null,
          construction_no: null,
          target_material_id: 'finished-test',
          target_batch_id: 'finished-batch',
          target_quantity: 1,
          target_area_sqm: null,
          total_cost: 20,
          remark: route.request().postDataJSON().p_payload.remark,
          created_at: '2026-10-06T01:00:00Z',
          warehouse: { warehouse_code: 'WH-TEST', warehouse_name: '测试组装仓库' },
          targetMaterial: { material_code: 'FINISHED-001', material_name: '测试组装成品' }
        })
      return failed
        ? route.fulfill({ status: 400, json: { code: 'P0001', message: '测试组装库存已变化' } })
        : route.fulfill({ json: 'assembly-test' })
    })
    await page.goto(
      entry === 'component'
        ? '/tests/e2e/fixtures/wms-operation-retry.html'
        : '#/wms/adjustment-business/assembly'
    )
    const openButton = page.getByRole('button', {
      name: entry === 'component' ? '测试库存组装' : '办理组装',
      exact: true
    })
    if (entry === 'menu' && testInfo.project.name.includes('dark'))
      await expect(page.locator('html')).toHaveClass(/dark/)
    if (entry === 'menu' && testInfo.project.name.includes('shadow'))
      await expect(page.locator('html')).toHaveAttribute('data-box-mode', 'shadow-mode')
    await openButton.click()
    const assembly = page.getByRole('dialog', { name: /办理库存组装/ })
    await assembly.getByRole('button', { name: '确定', exact: true }).click()
    await expect(page.getByText('请添加至少两条有效组件', { exact: true })).toBeVisible()
    await expect(assembly.getByText('请选择成品物料', { exact: true })).toHaveCount(0)
    expect(payloads).toHaveLength(0)
    async function pickBatch(index: number) {
      await assembly.getByPlaceholder('选择一个库存批次加入组件', { exact: true }).click()
      const picker = page.getByRole('dialog', { name: /添加来源批次/ })
      await picker
        .locator('.el-table__body')
        .getByText(`组装组件 ${index} · ASSEMBLY-BATCH-${index}`, { exact: true })
        .click()
      await picker.getByRole('button', { name: /^(确定|确认)$/ }).click()
    }
    let releaseSource!: () => void
    const sourcePending = new Promise<void>((resolve) => {
      releaseSource = resolve
    })
    let sourceStarted = false
    await page.route(
      '**/rest/v1/wms_serial_number?*',
      async (route) => {
        sourceStarted = true
        await sourcePending
        await route.fulfill({ json: [] })
      },
      { times: 1 }
    )
    await pickBatch(1)
    await expect.poll(() => sourceStarted).toBe(true)
    await assembly.getByRole('button', { name: '关闭此对话框', exact: true }).click()
    await expect(assembly).toBeHidden()
    const downstreamRequests: string[] = []
    const trackDownstream = (request: import('@playwright/test').Request) => {
      if (/\/rest\/v1\/mdm_warehouse(?:_bin)?\?/.test(request.url()))
        downstreamRequests.push(request.url())
    }
    page.on('request', trackDownstream)
    const sourceReturned = page.waitForResponse((response) =>
      response.url().includes('/wms_serial_number?')
    )
    releaseSource()
    await (await sourceReturned).finished()
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        )
    )
    expect(downstreamRequests).toEqual([])
    expect(payloads).toHaveLength(0)
    page.off('request', trackDownstream)
    await openButton.click()
    await expect(assembly.getByRole('spinbutton', { name: /ASSEMBLY-BATCH-.* 用量/ })).toHaveCount(
      0
    )
    for (const documentIndex of [1, 2]) {
      if (documentIndex === 2) {
        await openButton.click()
        await expect(
          assembly.getByRole('spinbutton', { name: /ASSEMBLY-BATCH-.* 用量/ })
        ).toHaveCount(0)
        await expect(assembly.getByRole('textbox', { name: '组装说明', exact: true })).toHaveValue(
          ''
        )
        await expect(assembly.getByRole('spinbutton', { name: /成品数量/ })).toHaveValue('1.000')
      }
      failed = true
      await pickBatch(1)
      for (const [index, message] of [
        [1, '该批次已加入组件'],
        [3, '组件仓库、库存组织、项目施工号与货权必须一致'],
        [4, '组件仓库、库存组织、项目施工号与货权必须一致'],
        [5, '垛包或 SN 批次请通过对应生产流程办理']
      ] as const) {
        await pickBatch(index)
        await expect(page.getByText(message, { exact: false }).first()).toBeVisible()
        await expect(
          assembly.getByRole('spinbutton', { name: /ASSEMBLY-BATCH-.* 用量/ })
        ).toHaveCount(1)
        expect(payloads).toHaveLength((documentIndex - 1) * 2)
      }
      await pickBatch(2)
      for (const index of [1, 2]) {
        await assembly
          .getByRole('spinbutton', { name: `ASSEMBLY-BATCH-${index} 用量`, exact: true })
          .fill(String(documentIndex + index))
      }
      for (const index of [1, 2]) {
        await expect(
          assembly.getByRole('spinbutton', { name: `ASSEMBLY-BATCH-${index} 用量`, exact: true })
        ).toBeVisible()
      }
      await assembly.getByPlaceholder('选择成品物料', { exact: true }).click()
      const materialPicker = page.getByRole('dialog', { name: /选择成品物料/ })
      await materialPicker
        .locator('.el-table__body')
        .getByText('测试组装成品', { exact: true })
        .click()
      await materialPicker.getByRole('button', { name: /^(确定|确认)$/ }).click()
      await assembly
        .getByRole('textbox', { name: '组装说明', exact: true })
        .fill(` 测试组装说明${documentIndex} `)
      await assembly.getByRole('button', { name: '确定', exact: true }).click()
      await expect(assembly.getByText('请选择成品库位', { exact: true })).toBeVisible()
      expect(payloads).toHaveLength((documentIndex - 1) * 2)
      await page.screenshot({
        path: testInfo.outputPath(`assembly-${documentIndex}-required-bin.png`),
        animations: 'disabled'
      })
      await assembly.getByRole('combobox', { name: /成品库位/ }).click()
      await page.getByRole('option', { name: /ASSEMBLY-BIN/ }).click()
      await expect(assembly.getByText('请选择成品库位', { exact: true })).not.toBeVisible()
      await assembly.getByRole('button', { name: '确定', exact: true }).click()
      await expect(page.getByText('测试组装库存已变化', { exact: false }).first()).toBeVisible()
      await expect(assembly.getByRole('textbox', { name: '组装说明', exact: true })).toHaveValue(
        ` 测试组装说明${documentIndex} `
      )
      await expect(
        assembly.getByRole('spinbutton', { name: /ASSEMBLY-BATCH-.* 用量/ })
      ).toHaveCount(2)
      await page.screenshot({
        path: testInfo.outputPath(`assembly-${documentIndex}-save-rejected.png`),
        animations: 'disabled'
      })
      failed = false
      await assembly.getByRole('button', { name: '确定', exact: true }).click()
      await expect(assembly).not.toBeVisible()
      if (entry === 'menu')
        await expect(
          page
            .locator('.el-table__body')
            .getByText(`SAVED-ASSEMBLY-${documentIndex}`, { exact: true })
        ).toBeVisible()
      expect(payloads).toHaveLength(documentIndex * 2)
      expect(payloads[documentIndex * 2 - 2]).toEqual(payloads[documentIndex * 2 - 1])
      expect(payloads[documentIndex * 2 - 1]).toMatchObject({
        p_payload: {
          target_material_id: 'finished-test',
          target_bin_id: 'target-bin',
          target_quantity: 1,
          remark: `测试组装说明${documentIndex}`,
          components: [
            { batch_id: 'batch-1', quantity: documentIndex + 1 },
            { batch_id: 'batch-2', quantity: documentIndex + 2 }
          ]
        }
      })
    }
  })
}
