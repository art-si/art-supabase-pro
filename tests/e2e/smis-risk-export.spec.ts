import { expect, test } from '@playwright/test'
import ExcelJS from 'exceljs'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'

test.use({ storageState: { cookies: [], origins: [] } })

for (const scenario of [
  { name: 'SmisDualControlRiskListSummary', path: 'risk-list-summary', title: '风险清单汇总' },
  { name: 'SmisDualControlSafetyRiskList', path: 'safety-risk-list', title: '安全风险清单' },
  { name: 'SmisDualControlRiskIdentification', path: 'risk-identification', title: '风险辨识' },
  {
    name: 'SmisDualControlRiskClassificationControl',
    path: 'risk-classification-control',
    title: '风险分级管控'
  }
]) {
  for (const incomplete of [false, true]) {
    test(
      incomplete
        ? `${scenario.title}导出拒绝缺失后续页并恢复按钮`
        : `${scenario.title}完整导出超过一万条记录`,
      async ({ page }) => {
        test.setTimeout(180_000)
        await prepareIsolatedSession(page)
        const menu = {
          id: 'risk-summary-menu',
          parentId: null,
          name: scenario.name,
          path: `/smis/dual-control-system/risk-control/${scenario.path}`,
          component: `/smis/dual-control-system/risk-control/${scenario.path}`,
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
        const records = Array.from({ length: 10001 }, (_, index) => ({
          id: `risk-${index}`,
          hazardNo: `RISK-${String(index).padStart(5, '0')}`,
          riskPointId: 'point-1',
          riskPointNo: 'POINT-1',
          riskName: '测试风险点',
          riskPointType: 'location',
          siteName: '测试场所',
          hazardSource: '测试危险源',
          activityNames: '',
          activityIds: [],
          accidentTypes: ['测试事故'],
          engineeringMeasures: '',
          managementMeasures: '',
          educationMeasures: '',
          personalProtectionMeasures: '',
          emergencyMeasures: '',
          controlLevels: ['company'],
          responsibleEmployeeIds: [],
          responsibleNames: '',
          responsibleDepartments: '',
          identifiedAt: '2026-10-04T00:00:00Z',
          status: 'enabled'
        }))
        const isIdentification = scenario.path === 'risk-identification'
        const isControl = scenario.path === 'risk-classification-control'
        let exportRecords: unknown[] = records
        if (isIdentification) {
          exportRecords = records.map((row, index) => ({
            id: row.id,
            pointNo: row.hazardNo,
            pointName: row.riskName,
            riskType: 'location',
            siteId: 'site-1',
            siteName: row.siteName,
            equipmentName: '测试设备',
            isSpecialEquipment: true,
            controlPlanAttachmentUrls: [],
            photoUrls: [],
            attachmentUrls: [],
            status: 'enabled',
            sort: index,
            organizations: [
              { id: 'org-1', organizationName: '测试单位', organizationCode: 'ORG-1' }
            ],
            hazardCount: 0,
            activityCount: 0,
            riskScore: 0,
            riskLevel: 'unidentified'
          }))
        } else if (isControl) {
          exportRecords = records.map((row) => ({
            riskPointId: row.id,
            riskPointNo: row.hazardNo,
            riskPointName: row.riskName,
            riskPointType: 'location',
            siteName: row.siteName,
            riskLevelCode: 'low',
            riskLevelName: '低风险',
            riskLevelColor: '#16a34a',
            accidentTypes: row.accidentTypes,
            controlStatus: 'active',
            controlLevels: ['company'],
            responsibleNames: '测试责任人',
            taskCount: 0,
            assignments: [
              {
                controlLevel: 'company',
                responsibleEmployeeId: 'employee-1',
                responsibleEmployeeNo: 'EMP-1',
                responsibleEmployeeName: '测试责任人',
                duplicateConfigurationId: 'frequency-1',
                frequencyLabel: '每日一次',
                controlMeasure: '测试管控要求',
                sort: 0
              }
            ]
          }))
        }
        const offsets: number[] = []
        const rpc = isControl
          ? 'smis_list_risk_control_points_secure'
          : isIdentification
            ? 'smis_list_risk_points_secure'
            : 'smis_list_safety_risks_secure'
        await page.route(`**/rest/v1/rpc/${rpc}`, async (route) => {
          const params: { p_from: number; p_to: number } = route.request().postDataJSON()
          offsets.push(params.p_from)
          await route.fulfill({
            json: {
              records:
                incomplete && params.p_from >= 500
                  ? []
                  : exportRecords.slice(params.p_from, params.p_to + 1),
              total: records.length,
              overview: isControl
                ? { total: records.length, uncontrolled: 0, active: records.length, major: 0 }
                : isIdentification
                  ? {
                      total: records.length,
                      identified: 0,
                      specialEquipment: records.length,
                      unidentified: records.length
                    }
                  : {
                      total: records.length,
                      evaluated: 0,
                      major: 0,
                      controlled: records.length
                    }
            }
          })
        })
        await page.route('**/rest/v1/rpc/smis_list_safety_risk_options_secure', (route) =>
          route.fulfill({ json: { riskPoints: [], hazardCategories: [] } })
        )
        await page.route('**/rest/v1/rpc/smis_list_risk_identification_options_secure', (route) =>
          route.fulfill({
            json: { sites: [], organizations: [], equipment: [], hazardCategories: [] }
          })
        )
        await page.route('**/rest/v1/rpc/smis_list_risk_control_options_secure', (route) =>
          route.fulfill({ json: { riskPoints: [], duplicateConfigurations: [] } })
        )
        await page.goto(`#/smis/dual-control-system/risk-control/${scenario.path}`)
        await expect(page.getByRole('heading', { name: scenario.title, exact: true })).toBeVisible()
        await expect(page.getByText('RISK-00000', { exact: true })).toBeVisible()
        offsets.length = 0
        const exportButton = page.getByRole('button', { name: '导出', exact: true })
        if (incomplete) {
          const downloads: string[] = []
          page.on('download', (download) => downloads.push(download.suggestedFilename()))
          await exportButton.click()
          await expect(
            page.getByText('数据未完整加载，请刷新后重试', { exact: true })
          ).toBeVisible()
          await expect(exportButton).toBeEnabled()
          expect(offsets).toEqual([0, 500])
          expect(downloads).toEqual([])
          await expect(page.getByText('RISK-00000', { exact: true })).toBeVisible()
          return
        }
        const downloadPromise = page.waitForEvent('download')
        await exportButton.click()
        const download = await downloadPromise
        const path = await download.path()
        expect(path).toBeTruthy()
        if (!path) throw new Error('未生成风险清单导出文件')
        const workbook = new ExcelJS.Workbook()
        await workbook.xlsx.readFile(path)
        const sheet = workbook.worksheets[0]
        expect(sheet.rowCount).toBe(10002)
        expect(sheet.getCell('A2').value).toBe('RISK-00000')
        expect(sheet.getCell('A10002').value).toBe('RISK-10000')
        if (isControl) {
          expect(sheet.getCell('E2').value).toBe('测试事故')
          expect(sheet.getCell('G2').value).toBe('EMP-1')
          expect(sheet.getCell('H2').value).toBe('每日一次')
          expect(sheet.getCell('I2').value).toBe('测试管控要求')
        } else if (isIdentification) {
          expect(sheet.getCell('E2').value).toBe('ORG-1')
          expect(sheet.getCell('F2').value).toBe('测试设备')
          expect(sheet.getCell('G2').value).toBe('是')
        } else {
          expect(sheet.getCell('F2').value).toBe('测试事故')
          expect(sheet.getCell('O2').value).toBe('公司级（厂级）')
        }
        expect(offsets).toEqual(Array.from({ length: 21 }, (_, index) => index * 500))
        await expect(page.getByText('RISK-00000', { exact: true })).toBeVisible()
      }
    )
  }
}
