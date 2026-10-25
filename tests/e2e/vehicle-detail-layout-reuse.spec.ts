import { expect, test, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(240_000)

interface DetailCase {
  name: string
  root: string
  rpc: string
  emptyText: string
  record: Record<string, unknown>
  groups: Record<string, string[]>
  publicText: string[]
  fourMetrics?: boolean
}
const attachment = {
  name: '受控附件.pdf',
  url: 'https://example.invalid/test.pdf',
  fileType: 'pdf',
  fileSize: '1 KB'
}
const cases: DetailCase[] = [
  {
    name: 'accident',
    root: 'accident-record-detail',
    rpc: 'vms_get_vehicle_accident_secure',
    emptyText: '暂无事故记录详情',
    record: {
      accidentTime: '2026-10-09T00:10:00Z',
      driverName: '受控驾驶员',
      driverPhone: '受控联系方式',
      accidentLocation: '受控事故地点',
      accidentLongitude: 0,
      accidentLatitude: 0,
      accidentSummary: '受控事故概述',
      remark: '受控事故备注\n第二行说明',
      economicLoss: 77777.77,
      companyBearAmount: 22222.22,
      processed: true
    },
    groups: {
      driverContact: ['受控驾驶员', '受控联系方式'],
      accidentLocation: ['受控事故地点'],
      accidentNarrative: ['受控事故概述', '受控事故备注'],
      lossAmounts: ['77,777.77', '22,222.22'],
      documents: ['受控附件.pdf']
    },
    publicText: ['基础信息', '责任及处理']
  },
  {
    name: 'maintenance',
    root: 'maintenance-record-detail',
    rpc: 'vms_get_vehicle_maintenance_secure',
    emptyText: '暂无维修保养详情',
    record: {
      maintenanceNo: '受控维修单号',
      maintenanceType: 'routine',
      costAmount: 55555.55,
      items: [{ itemName: '受控维修项目', quantity: 2 }],
      remark: '维修公开备注'
    },
    groups: {
      maintenanceIdentifiers: ['受控维修单号'],
      totalCost: ['55,555.55'],
      maintenanceItems: ['受控维修项目'],
      documents: ['受控附件.pdf']
    },
    publicText: ['基础信息', '常规保养', '维修公开备注']
  },
  {
    name: 'inspection',
    root: 'routine-inspection-detail',
    rpc: 'vms_get_vehicle_routine_inspection_secure',
    emptyText: '暂无例检记录详情',
    record: {
      routineInspectionNo: '例检测试编号',
      inspectionType: 'pre_trip',
      inspectionTime: '2026-10-09T00:10:00Z',
      inspector: '受控检查人',
      driverName: '受控驾驶员',
      checkResult: 'passed',
      checkCondition: '受控检查情况',
      handlingMethod: '受控处理方式',
      remark: '受控例检备注'
    },
    groups: {
      responsiblePeople: ['受控检查人', '受控驾驶员'],
      inspectionFindings: ['合格', '受控检查情况'],
      remediationDetails: ['受控处理方式', '受控例检备注'],
      documents: ['受控附件.pdf']
    },
    publicText: ['基础信息', '例检测试编号', '出车检查']
  },
  {
    name: 'insurance',
    root: 'vehicle-insurance-detail',
    rpc: 'vms_get_vehicle_insurance_secure',
    emptyText: '暂无车辆保险详情',
    record: {
      commercialPolicyNo: '受控商业保单',
      compulsoryPolicyNo: '受控交强保单',
      commercialPremium: 55555.55,
      compulsoryPremium: 22222.22,
      commercialExpireDate: '2027-06-30T00:00:00Z',
      compulsoryExpireDate: '2027-07-31T00:00:00Z',
      remark: '保险公开备注'
    },
    groups: {
      policyNumbers: ['受控商业保单', '受控交强保单'],
      premiumAmounts: ['55,555.55', '22,222.22'],
      documents: ['受控附件.pdf']
    },
    publicText: ['保险信息', '2027-06-30', '2027-07-31', '保险公开备注']
  },
  {
    name: 'annual-inspection',
    root: 'vehicle-inspection-detail',
    rpc: 'vms_get_vehicle_inspection_secure',
    emptyText: '暂无车辆年检详情',
    fourMetrics: true,
    record: {
      inspectionNo: '受控年检编号',
      inspectionDate: '2026-09-30',
      expireDate: '2027-09-30',
      inspectionAmount: 77777.77,
      compulsoryPolicyNo: '受控关联保单',
      compulsoryPremium: 22222.22
    },
    groups: {
      inspectionIdentifiers: ['受控年检编号'],
      monetaryAmounts: ['77,777.77'],
      documents: ['受控附件.pdf']
    },
    publicText: ['年检信息', '2026-09-30', '2027-09-30']
  },
  {
    name: 'part',
    root: 'vehicle-part-usage-detail',
    rpc: 'vms_get_vehicle_part_usage_secure',
    emptyText: '暂无零部件详情',
    fourMetrics: true,
    record: {
      partName: '测试零部件',
      partCode: 'PART-TEST',
      status: 'scrapped',
      rfidEnabled: true,
      rfidTag: '受控RFID',
      enableDate: '2026-08-05',
      usedMileage: 55555.55,
      supplierName: '受控供应商',
      supplierContact: '受控供应联系人',
      scrapReason: '受控报废说明',
      remark: '受控零件备注'
    },
    groups: {
      traceabilityTag: ['受控RFID'],
      lifecycleLimits: ['2026-08-05', '55,555.55'],
      supplierDetails: ['受控供应商', '受控供应联系人'],
      dispositionNotes: ['受控报废说明', '受控零件备注']
    },
    publicText: ['零部件信息', '零部件使用', '已报废']
  }
]

function payload(item: DetailCase, access: Record<string, string>) {
  return {
    id: 'display-test',
    plateNo: '测试车辆',
    companyName: '测试公司',
    attachments: [attachment],
    ...item.record,
    fieldAccess: access
  }
}
async function prepareDetailSession(page: Page) {
  await prepareIsolatedSession(page)
  const dictionaries: Record<string, { label: string; value: string }[]> = {
    vehiclePartUsageStatus: [{ label: '已报废', value: 'scrapped' }],
    vehicleRecordProcessed: [{ label: '已处理', value: 'true' }],
    vehicleMaintenanceType: [{ label: '常规保养', value: 'routine' }],
    vehicleRoutineInspectionType: [{ label: '出车检查', value: 'pre_trip' }],
    vehicleRoutineInspectionResult: [{ label: '合格', value: 'passed' }]
  }
  await page.route('**/rest/v1/sys_dictionary?*', (route) => {
    const code =
      new URL(route.request().url()).searchParams
        .get('dict_type_table.code')
        ?.replace(/^eq\./, '') ?? ''
    return route.fulfill({
      json: (dictionaries[code] ?? []).map((item, index) => ({
        ...item,
        id: code + index,
        status: '1',
        sort: index,
        dict_type_table: { code, name: code }
      }))
    })
  })
}
async function checkVisibility(page: Page, item: DetailCase, allowed: string[]) {
  const root = page.locator(`.${item.root}`)
  await expect(root).toContainText('测试车辆')
  if (item.name === 'accident') {
    await expect(root.locator('.accident-record-detail__summary')).toContainText(
      '2026-10-09 08:10:00'
    )
    await expect(root.locator('.accident-record-detail__summary')).not.toContainText('T00:10:00Z')
  }
  await expect(root.locator('.art-page-section')).not.toHaveCount(0)
  if (item.name === 'insurance') await expect(root).not.toContainText('T00:00:00Z')
  for (const text of item.publicText) await expect(root).toContainText(text)
  for (const [group, texts] of Object.entries(item.groups))
    for (const text of texts) {
      if (allowed.includes(group)) await expect(root).toContainText(text)
      else await expect(root).not.toContainText(text)
    }
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1)
}

for (const item of cases) {
  test(`车辆详情复用分区和独立字段权限 ${item.name}`, async ({ page }, info) => {
    await prepareDetailSession(page)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const groups = Object.keys(item.groups)
    let access: Record<string, string> = Object.fromEntries(groups.map((group) => [group, 'read']))
    await page.route(`**/rest/v1/rpc/${item.rpc}`, (route) =>
      route.fulfill({ json: payload(item, access) })
    )
    for (const dark of [false, true])
      for (const boxMode of ['border-mode', 'shadow-mode']) {
        access = Object.fromEntries(groups.map((group) => [group, 'read']))
        await page.goto(
          `/tests/e2e/fixtures/date-format-reuse.html?vehicle=${item.name}&detailLayout`
        )
        await page.evaluate(
          ({ dark, boxMode }) => {
            document.documentElement.classList.toggle('dark', dark)
            document.documentElement.dataset.boxMode = boxMode
          },
          { dark, boxMode }
        )
        await checkVisibility(page, item, groups)
        const geometry = await page.locator(`.${item.root}`).evaluate((root) => {
          const summary = root.querySelector<HTMLElement>('[class*="__summary "]')!
          const content = root.querySelector<HTMLElement>('[class*="__content "]')!
          return {
            padding: getComputedStyle(root).paddingTop,
            gap: getComputedStyle(content).gap,
            summaryGap: getComputedStyle(summary).gap,
            columns: getComputedStyle(summary).gridTemplateColumns.split(/\s+/).length
          }
        })
        expect(geometry).toEqual({
          padding: '16px',
          gap: '24px',
          summaryGap: '16px',
          columns:
            info.project.name === 'mobile-390'
              ? item.fourMetrics
                ? 2
                : 1
              : item.fourMetrics
                ? 4
                : 3
        })
        if ((!dark && boxMode === 'border-mode') || item.name === 'maintenance')
          await page.screenshot({
            path: info.outputPath(`detail-${dark ? 'dark' : 'light'}-${boxMode}.png`),
            fullPage: true
          })
      }
    for (const allowed of [[], ...groups.map((group) => [group])]) {
      access = Object.fromEntries(
        groups.map((group) => [group, allowed.includes(group) ? 'read' : 'hidden'])
      )
      await page.goto(
        `/tests/e2e/fixtures/date-format-reuse.html?vehicle=${item.name}&detailLayout`
      )
      await checkVisibility(page, item, allowed)
    }
    expect(errors).toEqual([])
  })

  test(`车辆详情加载失败、重试和空态 ${item.name}`, async ({ page }) => {
    await prepareDetailSession(page)
    let state: 'failure' | 'read' | 'empty' = 'failure'
    const access = Object.fromEntries(Object.keys(item.groups).map((group) => [group, 'read']))
    await page.route(`**/rest/v1/rpc/${item.rpc}`, (route) =>
      state === 'failure'
        ? route.fulfill({
            status: 403,
            json: { code: '42501', message: 'permission denied for relation' }
          })
        : route.fulfill({ json: state === 'empty' ? null : payload(item, access) })
    )
    await page.goto(`/tests/e2e/fixtures/date-format-reuse.html?vehicle=${item.name}&detailLayout`)
    const root = page.locator(`.${item.root}`)
    await expect(root.getByText('当前账号没有此操作权限', { exact: true })).toBeVisible()
    await expect(root.getByText(item.emptyText, { exact: true })).toHaveCount(0)
    await expect(page.locator('.el-message')).toHaveCount(0)
    state = 'read'
    await root.getByRole('button', { name: '重新加载' }).click()
    await checkVisibility(page, item, Object.keys(item.groups))
    state = 'empty'
    await page.reload()
    await expect(root.getByText(item.emptyText, { exact: true })).toBeVisible()
    await expect(root.locator('.art-page-section')).toHaveCount(0)
  })
}

test('例检附件和零部件寿命保留脱敏显示', async ({ page }) => {
  await prepareDetailSession(page)
  for (const name of ['inspection', 'part']) {
    const item = cases.find((item) => item.name === name)!
    const record = {
      ...payload(
        item,
        Object.fromEntries(Object.keys(item.groups).map((group) => [group, 'read']))
      ),
      attachmentsMasked: name === 'inspection',
      lifecycleLimitsMasked: name === 'part'
    }
    await page.route(`**/rest/v1/rpc/${item.rpc}`, (route) => route.fulfill({ json: record }))
    await page.goto(`/tests/e2e/fixtures/date-format-reuse.html?vehicle=${name}&detailLayout`)
    const root = page.locator(`.${item.root}`)
    await expect(root).toContainText('***')
    if (name === 'inspection') {
      await expect(root).toContainText('附件内容已脱敏')
      await expect(root).not.toContainText('受控附件.pdf')
    } else {
      await expect(root).not.toContainText('55,555.55')
      await expect(root).not.toContainText('2026-08-05')
    }
  }
})

test('车辆详情加载使用公共骨架状态', async ({ page }) => {
  await prepareDetailSession(page)
  const item = cases[1]
  let release: (() => void) | undefined
  const loading = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(`**/rest/v1/rpc/${item.rpc}`, async (route) => {
    await loading
    await route.fulfill({
      json: payload(
        item,
        Object.fromEntries(Object.keys(item.groups).map((group) => [group, 'read']))
      )
    })
  })
  await page.goto(`/tests/e2e/fixtures/date-format-reuse.html?vehicle=${item.name}&detailLayout`)
  await expect(page.locator(`.${item.root} .art-async-state[aria-busy="true"]`)).toBeVisible()
  await expect(page.locator('.art-async-state__skeleton')).toBeVisible()
  release?.()
  await checkVisibility(page, item, Object.keys(item.groups))
})
