import { expect, test } from '@playwright/test'
import ExcelJS from 'exceljs'
import { omit } from 'lodash-es'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'

test.use({ storageState: { cookies: [], origins: [] } })

for (const scenario of [
  {
    name: 'SmisDualControlPositionRiskChecklist',
    path: 'position-risk-checklist',
    title: '岗位风险清单',
    rpc: 'smis_list_position_risk_checklist_secure',
    verificationCell: 'N2',
    verificationValue: '1日1次',
    firstPrefix: '测试组织',
    visiblePrefix: '测试岗位',
    keyword: '测试'
  },
  {
    name: 'SmisDualControlAccidentHiddenHazardInspectionChecklist',
    path: 'accident-hidden-hazard-inspection-checklist',
    title: '事故隐患排查清单',
    rpc: 'smis_list_accident_hidden_hazard_inspection_checklist_secure',
    verificationCell: 'H2',
    verificationValue: '1日1次',
    firstPrefix: '测试组织',
    visiblePrefix: '测试岗位',
    keyword: '测试'
  },
  {
    name: 'SmisDualControlPositionSafetyResponsibilityChecklist',
    path: 'position-safety-responsibility-checklist',
    title: '岗位安全责任制清单',
    rpc: 'smis_list_position_safety_responsibility_checklist_secure',
    verificationCell: 'D2',
    verificationValue: '测试责任范围',
    firstPrefix: '测试组织',
    visiblePrefix: '测试岗位',
    keyword: '测试'
  },
  {
    name: 'SmisDualControlPersonnelChecklist',
    path: 'personnel-dual-control-checklist',
    title: '人员双控清单',
    rpc: 'smis_list_personnel_dual_control_checklist_secure',
    verificationCell: 'C2',
    verificationValue: '男',
    firstPrefix: 'EMP',
    visiblePrefix: '测试人员',
    keyword: null
  },
  {
    name: 'SmisDualControlRiskControlInformationChecklist',
    path: 'risk-control-information-checklist',
    title: '风险管控信息清单',
    rpc: 'smis_list_risk_control_information_secure',
    verificationCell: 'J2',
    verificationValue: 'LEC · 1 × 2 × 3 = 6',
    firstPrefix: 'HAZARD',
    visiblePrefix: 'HAZARD',
    keyword: null
  },
  {
    name: 'SmisDualControlHiddenHazardGovernanceLedger',
    path: 'hidden-hazard-governance-ledger',
    title: '隐患治理信息台账',
    rpc: 'smis_list_hidden_hazard_ledger_secure',
    verificationCell: 'I2',
    verificationValue: '2026-10-01 10:00',
    firstPrefix: 'HAZARD',
    visiblePrefix: 'HAZARD',
    keyword: null
  }
]) {
  for (const incomplete of [false, true]) {
    test(`${scenario.title}${incomplete ? '拒绝缺失导出页' : '完整导出超过一万条'}`, async ({
      page
    }) => {
      test.setTimeout(180_000)
      await prepareIsolatedSession(page)
      await page.route('**/rest/v1/sys_dictionary?*', (route) =>
        route.fulfill({
          headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' },
          json: [
            {
              id: 'sex-male',
              label: '男',
              value: 'male',
              status: '1',
              sort: 1,
              dict_type_table: { code: 'sex', name: '性别' }
            }
          ]
        })
      )
      const menu = {
        id: 'checklist-menu',
        parentId: null,
        name: scenario.name,
        path: `/smis/dual-control-system/dual-control-checklist/${scenario.path}`,
        component: `/smis/dual-control-system/dual-control-checklist/${scenario.path}`,
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
        id: `checklist-${index}`,
        positionId: `position-${index}`,
        positionCode: `POS-${index}`,
        positionName: `测试岗位-${index}`,
        employeeNo: `EMP-${index}`,
        employeeName: `测试人员-${index}`,
        gender: 'male',
        age: 30,
        riskCount: 1,
        inspectionCount: 1,
        hazardCount: 0,
        hazardNo: `HAZARD-${index}`,
        organizationIds: [`organization-${index}`],
        organizationNames: `测试组织-${index}`,
        siteName: '测试场所',
        isSpecialEquipment: false,
        methodCode: 'LEC',
        lValue: 1,
        eValue: 2,
        cValue: 3,
        riskScore: 6,
        measureCount: 1,
        linkedPositionCount: 1,
        generatedHazardCount: 0,
        sourceType: 'inspection',
        status: 'pending',
        description: `测试隐患-${index}`,
        location: '测试位置',
        reporterEmployeeNo: 'EMP-1',
        reporterEmployeeName: '测试上报人',
        reportedAt: '2026-10-01T02:00:00Z',
        imageUrls: [],
        rectificationImageUrls: [],
        acceptanceImageUrls: [],
        overdue: false,
        evidenceCount: 0,
        scheduleCount: 1,
        responsibilityScope: '测试责任范围',
        workContent: '测试工作内容',
        organizationId: `organization-${index}`,
        organizationCode: `ORG-${index}`,
        organizationName: `测试组织-${index}`,
        pointNo: `POINT-${index}`,
        identificationLocation: '测试区域',
        equipmentFacility: '测试设备',
        activityNames: '测试作业',
        hazardFactor: '测试因素',
        accidentTypes: [],
        controlMeasureCategory: '',
        controlLevel: '',
        controlMeasure: '测试措施',
        standardBasis: '测试依据',
        failureMode: '测试失效',
        hazardLevel: '',
        frequencyCount: 1,
        frequencyUnit: 'day',
        identificationUnits: [],
        inspectionItem: `排查项目-${index}`,
        inspectionStandard: '测试排查标准',
        primaryHazardCategory: '',
        secondaryHazardCategory: '',
        riskLevel: '',
        inspectionFrequency: 1,
        revisionDate: '2026-10-01',
        standardSource: '测试来源'
      }))
      const requests: Array<{ p_from: number; p_to: number; [key: string]: unknown }> = []
      await page.route(`**/rest/v1/rpc/${scenario.rpc}`, async (route) => {
        const params: (typeof requests)[number] = route.request().postDataJSON()
        requests.push(params)
        await route.fulfill({
          json: {
            records:
              incomplete && params.p_from >= 500
                ? []
                : records.slice(params.p_from, params.p_to + 1),
            total: records.length,
            overview: {
              total: records.length,
              major: 0,
              identifiedUnits: 0,
              positions: records.length,
              organizations: records.length,
              scheduled: records.length,
              withRisk: records.length,
              withInspection: records.length,
              riskMeasures: records.length,
              inspectionStandards: records.length,
              evaluated: records.length,
              controlled: records.length,
              generatedHazards: 0
            }
          }
        })
      })
      await page.goto(
        `#/smis/dual-control-system/dual-control-checklist/${scenario.path}?keyword=测试`
      )
      await expect(page.getByRole('heading', { name: scenario.title, exact: true })).toBeVisible()
      await expect(page.getByText(`${scenario.visiblePrefix}-0`, { exact: true })).toBeVisible()
      const filters = omit(requests[0], ['p_from', 'p_to'])
      expect(filters.p_keyword).toBe(scenario.keyword)
      requests.length = 0
      const button = page.getByRole('button', { name: /^导出(清单|台账)$/ })
      if (incomplete) {
        const downloads: string[] = []
        page.on('download', (download) => downloads.push(download.suggestedFilename()))
        await button.click()
        await expect(page.getByText('数据未完整加载，请刷新后重试', { exact: true })).toBeVisible()
        await expect(button).toBeEnabled()
        expect(downloads).toEqual([])
        expect(requests.map((request) => request.p_from)).toEqual([0, 500])
      } else {
        const downloadPromise = page.waitForEvent('download')
        await button.click()
        const path = await (await downloadPromise).path()
        if (!path) throw new Error('未生成双控清单文件')
        const workbook = new ExcelJS.Workbook()
        await workbook.xlsx.readFile(path)
        const sheet = workbook.worksheets[0]
        expect(sheet.rowCount).toBe(10002)
        expect(sheet.getCell('A2').value).toBe(`${scenario.firstPrefix}-0`)
        expect(sheet.getCell('A10002').value).toBe(`${scenario.firstPrefix}-10000`)
        expect(sheet.getCell(scenario.verificationCell).value).toBe(scenario.verificationValue)
        expect(requests.map((request) => request.p_from)).toEqual(
          Array.from({ length: 21 }, (_, index) => index * 500)
        )
      }
      for (const request of requests) expect(omit(request, ['p_from', 'p_to'])).toEqual(filters)
      await expect(page.getByText(`${scenario.visiblePrefix}-0`, { exact: true })).toBeVisible()
    })
  }
}
