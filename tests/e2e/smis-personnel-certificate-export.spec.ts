import { expect, test } from '@playwright/test'
import ExcelJS from 'exceljs'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'
import { assertTableFocusContract } from './support/table-focus'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

const scenarios = [
  {
    path: 'special-equipment-personnel-certificate-ledger',
    name: 'SmisPersonnelCertificateLedger',
    title: '特种设备人员证件台账',
    category: null
  },
  {
    path: 'special-equipment-operator-certificate-ledger',
    name: 'SmisSpecialEquipmentOperatorCertificateLedger',
    title: '特种设备作业人员证件台账',
    category: 'special_equipment_operator'
  },
  {
    path: 'special-operation-certificate',
    name: 'SmisSpecialOperationCertificate',
    title: '特种作业操作证',
    category: 'special_operation'
  },
  {
    path: 'safety-manager-certificate',
    name: 'SmisSafetyManagerCertificate',
    title: '安全管理人员证',
    category: 'safety_manager'
  },
  {
    path: 'registered-safety-engineer-ledger',
    name: 'SmisRegisteredSafetyEngineerLedger',
    title: '注册安全工程师台账',
    category: 'registered_safety_engineer'
  }
]

for (const scenario of scenarios) {
  for (const incomplete of [false, true]) {
    test(`${scenario.title}导出 ${incomplete ? 'incomplete' : 'complete'}`, async ({
      page
    }, testInfo) => {
      const tenant = await prepareIsolatedSession(page)
      const path = `/smis/qualification-training/safety-qualification-management/${scenario.path}`
      const menu = {
        id: 'certificate-export-test',
        parentId: null,
        name: scenario.name,
        path,
        component: path,
        type: 'menu',
        sort: 1,
        meta: { title: scenario.title, is_enable: true, is_hide: false, roles: [] }
      }
      await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
        route.fulfill({ json: [{ code: 'smis', name: '测试安全管理', baseUrl: '/smis/' }] })
      )
      await mockApplicationMenus(page, {
        smis: [
          menu,
          ...['View', 'Export'].map((action) => ({
            ...menu,
            id: `${menu.id}-${action}`,
            parentId: menu.id,
            name: `${menu.name}:${action}`,
            path: '',
            component: '',
            type: 'button'
          }))
        ]
      })
      const records = Array.from({ length: 5001 }, (_, index) => ({
        id: `certificate-${index}`,
        tenantId: tenant.id,
        employeeId: `employee-${index}`,
        employeeNo: `EMP-${index}`,
        employeeName: `测试人员-${index}`,
        avatarUrl: null,
        gender: '男',
        idCardNo: null,
        educationLevel: null,
        organizationName: '测试部门',
        jobTitle: '测试岗位',
        phone: null,
        certificateCategory: scenario.category ?? 'special_operation',
        certificateNumber: `CERT-${index}`,
        extraFields: {},
        warningStatus: 'normal',
        reminderState: 'normal',
        nearestEffectiveDate: '2027-10-01',
        items: [
          {
            id: `item-${index}`,
            workCode: 'A1',
            workName: '测试作业',
            effectiveDate: '2027-10-01',
            reminderState: 'normal'
          }
        ],
        reviewHistory: []
      }))
      const offsets: number[] = []
      await page.route(
        '**/rest/v1/rpc/smis_list_personnel_certificates_extended_secure',
        (route) => {
          const query = route.request().postDataJSON()
          expect(query.p_certificate_category).toBe(scenario.category)
          if (query.p_purpose === 'export') {
            expect(query.p_to - query.p_from + 1).toBe(500)
            expect(query.p_employee_name).toBeNull()
            expect(query.p_certificate_number).toBeNull()
            offsets.push(query.p_from)
          }
          return route.fulfill({
            json: {
              records:
                incomplete && query.p_purpose === 'export' && query.p_from >= 500
                  ? []
                  : records.slice(query.p_from, Math.min(query.p_to + 1, query.p_from + 1000)),
              total: records.length,
              overview: {
                total: records.length,
                normal: records.length,
                warning: 0,
                expired: 0,
                employees: records.length
              }
            }
          })
        }
      )
      await page.goto(`#${path}`)
      await expect(page.getByRole('heading', { name: scenario.title, exact: true })).toBeVisible({
        timeout: 60_000
      })
      await expect(
        page.locator('.el-table__body-wrapper').getByText('测试人员-0', { exact: true }).first()
      ).toBeVisible()
      const button = page.getByRole('button', { name: '导出', exact: true })
      if (incomplete) {
        const downloads: string[] = []
        page.on('download', (download) => downloads.push(download.suggestedFilename()))
        await button.click()
        await expect(page.getByText('数据未完整加载，请刷新后重试', { exact: true })).toBeVisible()
        expect(downloads).toEqual([])
        expect(offsets).toEqual([0, 500])
      } else {
        const pending = page.waitForEvent('download')
        await button.click()
        const file = await (await pending).path()
        if (!file) throw new Error('人员证件导出未生成文件')
        const workbook = new ExcelJS.Workbook()
        await workbook.xlsx.readFile(file)
        const sheet = workbook.worksheets[0]
        expect(sheet.rowCount).toBe(5002)
        expect(sheet.getRow(5002).getCell(10).value).toBe('CERT-5000')
        expect(sheet.getRow(5002).getCell(14).value).toBe('正常')
        expect(sheet.getRow(5002).getCell(15).value).toBe('A1 测试作业（2027-10-01）')
        expect(offsets).toEqual(Array.from({ length: 11 }, (_, index) => index * 500))
        await assertTableFocusContract(page, testInfo)
      }
      await expect(button).toBeEnabled()
      await page.screenshot({ path: testInfo.outputPath('certificate-export.png'), fullPage: true })
    })
  }
}
