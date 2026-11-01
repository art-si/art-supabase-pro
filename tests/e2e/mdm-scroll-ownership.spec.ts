import { expect, test, type Page } from '@playwright/test'
import { installFixtures, tenantId, materialId } from './support/inventory-fixtures'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 20_000 })
test.setTimeout(90_000)

async function expectSceneFill(page: Page) {
  const frame = page.locator('.scene-frame')
  const canvas = frame.locator('canvas.rack-scene__canvas')
  await expect(canvas).toBeVisible()
  await expect
    .poll(
      async () => {
        const scene = (await frame.boundingBox())!,
          area = (await canvas.boundingBox())!
        return Math.abs(scene.height - area.height) + Math.abs(scene.width - area.width)
      },
      { message: '3D画布必须填满包含图例的场景框，不能留下白色底部' }
    )
    .toBeLessThanOrEqual(2)
  await expect
    .poll(
      () =>
        canvas.evaluate((element) => {
          const rect = element.getBoundingClientRect(),
            node = element as HTMLCanvasElement
          const ratio = Math.min(devicePixelRatio, 2)
          return (
            Math.abs(node.width - rect.width * ratio) + Math.abs(node.height - rect.height * ratio)
          )
        }),
      { message: 'ResizeObserver应让WebGL绘制缓冲区同步画布尺寸' }
    )
    .toBeLessThanOrEqual(3)
  const geometry = await frame.evaluate((element) => {
    const host = element.querySelector('.rack-scene')!.getBoundingClientRect()
    const footer = element.querySelector('.scene-footer')!.getBoundingClientRect()
    const canvas = element.querySelector('canvas') as HTMLCanvasElement
    return {
      width: host.width,
      height: host.height,
      bufferWidth: canvas.width,
      bufferHeight: canvas.height,
      footerInside:
        footer.top >= host.top &&
        footer.bottom <= host.bottom + 1 &&
        footer.left >= host.left &&
        footer.right <= host.right + 1
    }
  })
  expect(geometry.footerInside, '图例和操作说明应位于同一暗色画布区域').toBe(true)
  return geometry
}

async function openEntry(page: Page, entry: string, theme: string) {
  await installFixtures(page)
  await page.route('**/rest/v1/**', async (route) => {
    const table = new URL(route.request().url()).pathname.split('/').at(-1)
    let rows: unknown[] | undefined
    if (table === 'mdm_master_group')
      rows = Array.from({ length: 36 }, (_, i) => ({
        id: `industry-${i}`,
        tenant_id: tenantId,
        parent_id: null,
        code: `I${i + 1}`,
        name: `验收行业 ${String(i + 1).padStart(2, '0')}`,
        sort: i,
        enabled: true
      }))
    if (table === 'mdm_component_type') rows = []
    if (table === 'mdm_accessory_processing_list')
      rows = Array.from({ length: 36 }, (_, i) => ({
        id: `accessory-${i}`,
        tenant_id: tenantId,
        source_path: null,
        source_name: '',
        project_name: `验收配件项目 ${String(i + 1).padStart(2, '0')}`,
        project_id: `project-${i}`,
        drawing_name: '验收图纸',
        category_id: null,
        customer_id: null,
        status: 'draft',
        confidence: 1,
        warnings: [],
        create_time: '2026-11-01T08:00:00Z',
        items: [
          {
            id: `item-${i}`,
            row_no: 1,
            name: '验收加工件',
            width_mm: 100,
            length_m: 2,
            quantity: 1,
            material_color: '镀锌',
            workOrders: []
          }
        ]
      }))
    if (table === 'mdm_process_route_sequence')
      rows = Array.from({ length: 24 }, (_, i) => ({
        id: `sequence-${i}`,
        route_id: 'route-test',
        tenant_id: tenantId,
        sequence_no: i + 1,
        sequence_type: i ? 'parallel' : 'main',
        remark: `验收路径 ${String(i + 1).padStart(2, '0')}`,
        sort: i
      }))
    if (table === 'mdm_process_route_step') rows = []
    if (table === 'mdm_process_route_references')
      return route.fulfill({
        json: {
          groups: [],
          operations: [],
          controlCodes: [],
          units: [],
          departments: [],
          workCenters: [],
          activityFormulas: [],
          suppliers: [],
          esopDocuments: []
        }
      })
    if (entry === 'bom' && table === 'mdm_material')
      rows = [
        {
          id: materialId,
          tenant_id: tenantId,
          material_code: 'BOM-ROOT',
          material_name: '验收父项物料',
          description: '验收父项物料',
          status: 'enabled',
          image_urls: []
        }
      ]
    if (table === 'mdm_bom')
      rows = [
        {
          id: 'bom-test',
          tenant_id: tenantId,
          material_id: materialId,
          bom_code: 'BOM-TEST',
          version: 'V1',
          status: 'effective'
        }
      ]
    if (table === 'mdm_bom_structure_detail')
      rows = Array.from({ length: 36 }, (_, i) => ({
        node_id: `node-${i}`,
        parent_node_id: i ? 'node-0' : null,
        depth: i ? 1 : 0,
        material_id: materialId,
        material_code: `MAT-${i}`,
        material_name: `验收BOM节点 ${String(i + 1).padStart(2, '0')}`,
        drawing_no: '',
        specification_model: '验收规格',
        quantity: 1,
        component_quantity: 1,
        has_children: !i,
        is_virtual: false,
        unit_name: '件',
        unit_code: 'PC'
      }))
    if (table === 'mdm_list_statutory_holidays_secure')
      return route.fulfill({ json: { records: [], total: 0 } })
    if (rows)
      return route.fulfill({
        headers: {
          'content-range': rows.length ? `0-${rows.length - 1}/${rows.length}` : '*/0',
          'access-control-expose-headers': 'content-range'
        },
        json: rows
      })
    return route.fallback()
  })
  await page.goto(`/tests/e2e/fixtures/mdm-scroll-ownership.html?entry=${entry}&theme=${theme}`)
  if (entry === 'route')
    await page.getByRole('button', { name: '打开工序维护', exact: true }).click()
  if (entry === 'bom') {
    await page.getByRole('textbox', { name: '物料描述', exact: true }).click()
    const picker = page.getByRole('dialog', { name: '选择父项物料', exact: true })
    await expect(picker).toBeVisible()
    await picker.getByText('验收父项物料', { exact: true }).first().click()
    await picker.getByRole('button', { name: '确定', exact: true }).click()
  }
}

const entries = [
  {
    entry: 'production',
    card: '.production-tree',
    last: '验收生产组织 36',
    search: '搜索部门名称或编码'
  },
  { entry: 'catalog', card: '.catalog-navigator', last: '验收主档分类 36', search: '搜索主档分类' },
  {
    entry: 'component',
    card: '.component-type-page__navigation',
    last: '验收行业 36',
    search: '搜索行业分组'
  },
  {
    entry: 'accessory',
    card: '.accessory-processing-page__navigator',
    last: '验收配件项目 36',
    search: '搜索项目名称树'
  },
  { entry: 'bom', card: '.bom-structure-page__navigator', last: '验收BOM节点 36' },
  { entry: 'route', card: '.route-maintenance__sequences' },
  { entry: 'holiday', card: '.holiday-page__calendar-card' },
  { entry: 'bin', card: '.art-section-card', title: '仓库' },
  { entry: 'bin-3d', card: '.art-section-card', title: '货架库区' }
]
for (const visual of [
  { theme: 'light', width: 1440, height: 1000 },
  { theme: 'dark', width: 390, height: 844 }
]) {
  for (const item of entries) {
    test(`${item.entry} ${visual.theme}${visual.width} 卡片滚动归属与实际交互`, async ({
      page
    }, info) => {
      await page.setViewportSize(visual)
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await openEntry(page, item.entry, visual.theme)
      const card = item.title
        ? page
            .locator(item.card)
            .filter({ has: page.getByText(item.title, { exact: true }) })
            .first()
        : page.locator(item.card)
      await expect(card).toBeVisible()
      await expect(card.locator('.el-scrollbar')).toHaveCount(1)
      const scroll = card.locator(':scope > .art-section-card__scrollbar')
      await expect(scroll).toBeVisible()
      const toolbar = card.locator(':scope > .art-section-card__toolbar')
      const toolbarTop = (await toolbar.count()) ? (await toolbar.boundingBox())!.y : undefined
      if (item.last) {
        const target = card.getByText(item.last, { exact: true }).first()
        await target.click()
        const geometry = await target.evaluate((element) => {
          const selected =
            element.closest('.el-tree-node__content') || element.closest('button') || element
          const row = selected.getBoundingClientRect(),
            card = element.closest('.art-section-card')!.getBoundingClientRect()
          return { left: row.left - card.left, right: card.right - row.right }
        })
        expect(geometry.left).toBeGreaterThanOrEqual(15)
        expect(geometry.right).toBeGreaterThanOrEqual(15)
      } else if (item.entry === 'route') {
        await card.getByRole('button', { name: /24/ }).first().click()
        await expect(card.locator('.route-maintenance__sequence.is-current')).toContainText('24')
        if (visual.width === 390)
          await expect(scroll.locator(':scope > .el-scrollbar__wrap')).toHaveCSS(
            'max-height',
            '200px'
          )
      } else if (item.entry === 'holiday') {
        const before = await card.locator('.holiday-page__calendar-header strong').innerText()
        await card.getByRole('button', { name: '下个月', exact: true }).click()
        await expect(card.locator('.holiday-page__calendar-header strong')).not.toHaveText(before)
      } else if (item.entry === 'bin-3d') {
        await card.locator('.nav-warehouse').first().click()
        const frame = page.locator('.scene-frame')
        const initial = await expectSceneFill(page)
        await page.setViewportSize({
          width: visual.width === 1440 ? 1220 : 430,
          height: visual.height - 100
        })
        const resized = await expectSceneFill(page)
        expect(Math.abs(resized.width - initial.width)).toBeGreaterThan(5)
        await page.setViewportSize(visual)
        await expectSceneFill(page)
        await page.getByRole('button', { name: '俯视', exact: true }).click()
        await expect(page.getByRole('button', { name: '俯视', exact: true })).toHaveAttribute(
          'aria-pressed',
          'true'
        )
        await expectSceneFill(page)
        await page.locator('.rack-scene__label').filter({ hasText: 'A01' }).click()
        await page.getByRole('button', { name: /A01-01-01，空位/ }).click()
        await expect(page.getByRole('button', { name: '查看库存明细', exact: true })).toBeVisible()
        const detail = page
          .locator('.art-section-card')
          .filter({ has: page.getByText('货架详情', { exact: true }) })
        await expect(detail.locator(':scope > .art-section-card__scrollbar')).toHaveCount(1)
        await expect(detail.locator('.detail-bin-scroll > .el-scrollbar__wrap')).toHaveCSS(
          'max-height',
          '190px'
        )
        await page.getByRole('button', { name: '立体', exact: true }).click()
        const selected = await expectSceneFill(page)
        await info.attach('scene-geometry.json', {
          body: JSON.stringify({ initial, resized, selected }),
          contentType: 'application/json'
        })
        await frame.screenshot({
          path: info.outputPath('filled-scene.png'),
          timeout: 60_000,
          animations: 'disabled'
        })
      } else {
        await card
          .locator('button')
          .filter({ has: page.locator('strong') })
          .first()
          .click()
      }
      const wrap = scroll.locator(':scope > .el-scrollbar__wrap')
      await wrap.evaluate((element) => {
        element.scrollTop += 100
      })
      if (toolbarTop !== undefined) expect((await toolbar.boundingBox())!.y).toBe(toolbarTop)
      expect(await card.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
        true
      )
      await card.screenshot({
        path: info.outputPath('card.png'),
        timeout: 60_000,
        animations: 'disabled'
      })
      if (item.search) {
        const search = card.getByRole('textbox', { name: item.search, exact: true })
        await search.fill('不存在的节点')
        await search.fill('')
        await expect(card.getByText(item.last!, { exact: true }).first()).toBeAttached()
      }
      expect(errors).toEqual([])
    })
  }
}
