import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)
for (const theme of ['light', 'dark']) {
  for (const box of ['border-mode', 'shadow-mode']) {
    for (const edit of [false, true]) {
      test(`公共活动表${edit ? '编辑排序' : '只读数量'}保持一致 ${theme} ${box}`, async ({
        page
      }, info) => {
        await prepareIsolatedSession(page)
        const errors: string[] = []
        page.on('pageerror', (error) => errors.push(error.message))
        await page.route('**/rest/v1/**', (route) => {
          const url = new URL(route.request().url())
          const path = url.pathname
          let json: object = []
          if (path.endsWith('/sys_dictionary')) {
            const code = url.searchParams.get('dict_type_table.code')?.replace('eq.', '')
            const dictionaries: Record<string, object[]> = {
              mdmProcessOperationMode: [
                { label: '公共字典作业类型', value: 'normal', status: '1' },
                { label: '停用作业类型', value: 'disabled', status: '0' }
              ],
              mdmActivityType: [{ label: '加工活动', value: 'processing', status: '1' }],
              mdmWorkCenterMaintenanceRule: [
                { label: '无需维护检查', value: 'no_check', status: '1' }
              ],
              mdmActivityUnit: [{ label: '分钟', value: 'minute', status: '1' }],
              commonBoolean: [
                { label: '是', value: 'true', status: '1' },
                { label: '否', value: 'false', status: '1' }
              ]
            }
            json = dictionaries[code ?? ''] ?? []
          }
          if (path.endsWith('/mdm_process_route'))
            json = [
              {
                id: 'route-number',
                tenant_id: 'test-tenant',
                code: 'ROUTE-NUMBER',
                name: '数量验证路线',
                enabled: true,
                material: null
              }
            ]
          if (path.endsWith('/mdm_process_route_sequence'))
            json = [
              {
                id: 'sequence-number',
                route_id: 'route-number',
                sequence_no: 1,
                sequence_type: 'main',
                remark: ''
              }
            ]
          if (path.endsWith('/mdm_process_route_step'))
            json = [
              {
                id: 'step-number',
                tenant_id: 'test-tenant',
                route_id: 'route-number',
                sequence_id: 'sequence-number',
                code: '10',
                name: '数量验证工序',
                sort: 10,
                work_center_ids: [],
                run_output_quantity: 12345.6789014,
                run_processing_minutes: 0,
                run_green_minutes: null,
                setup_minutes: 1.2345678,
                queue_minutes: 0,
                transfer_minutes: 0,
                unit_conversion: { productionFactor: 12345.6789014, operationFactor: 1 },
                activities: [
                  {
                    name: '数量验证活动',
                    activity_type: 'processing',
                    basic_quantity: 12345.6789014,
                    activity_unit: 'minute',
                    maintenance_rule: 'no_check'
                  }
                ],
                sop_documents: []
              }
            ]
          if (path.endsWith('/rpc/mdm_process_route_references'))
            json = {
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
          return route.fulfill({
            json,
            headers: {
              'content-range': Array.isArray(json) && json.length ? '0-0/1' : '*/0',
              'access-control-expose-headers': 'content-range'
            }
          })
        })
        await page.goto(
          `/tests/e2e/fixtures/process-number-reuse.html?theme=${theme}&box=${box}${edit ? '&edit=1' : ''}`
        )
        await page.getByRole('button', { name: '查看工艺数量' }).click()
        if (edit)
          await page
            .locator('.route-maintenance__steps')
            .getByRole('button', { name: '编辑', exact: true })
            .click()
        else await page.getByText('数量验证工序', { exact: true }).first().click()
        const detail = page.getByRole('dialog', { name: edit ? '编辑工序明细' : '查看工序明细' })
        await expect(detail).toBeVisible()
        if (edit) {
          const operationMode = detail
            .locator('.el-form-item')
            .filter({ has: page.getByText('作业类型', { exact: true }) })
            .locator('.el-select')
          await operationMode.scrollIntoViewIfNeeded()
          await operationMode.click()
          const option = page.getByRole('option', { name: '公共字典作业类型', exact: true })
          await expect(option).toBeVisible()
          await expect(page.getByRole('option', { name: '停用作业类型', exact: true })).toHaveCount(
            0
          )
          await option.click()
          await expect(operationMode).toContainText('公共字典作业类型')
        }
        if (!edit) {
          await expect(detail).toContainText('12,345.678901 pcs')
          await expect(detail).toContainText('1.234568 分钟')
          await expect(detail).toContainText('0 分钟')
          await detail.getByText('12,345.678901 pcs', { exact: true }).scrollIntoViewIfNeeded()
          await detail.screenshot({ path: info.outputPath('process-quantity.png') })
        }
        await detail.getByRole('tab', { name: /单位换算/ }).click()
        await expect(detail.locator('.step-editor__equation')).toContainText(
          '12,345.678901 工序单位'
        )
        await expect(detail.locator('.step-editor__equation')).toBeVisible()
        const unitStatus = detail.locator('.step-editor__section-heading > span')
        await expect(unitStatus).toHaveText('已配置单位换算')
        if ((page.viewportSize()?.width ?? 0) > 900) await expect(unitStatus).toBeVisible()
        else await expect(unitStatus).toBeHidden()
        if (!edit)
          await expect(
            detail
              .locator('.step-editor__content:visible')
              .getByText('12,345.678901', { exact: true })
          ).toBeVisible()
        await detail.locator('.step-editor__equation').scrollIntoViewIfNeeded()
        const conversionResult = detail.locator('.step-editor__equation strong').last()
        await expect(conversionResult).toBeInViewport({ ratio: 1 })
        expect(
          await conversionResult.evaluate(
            (element) =>
              element.scrollWidth <= element.clientWidth + 1 &&
              element.scrollHeight <= element.clientHeight + 1
          )
        ).toBe(true)
        await detail.screenshot({ path: info.outputPath('process-unit.png') })
        if (edit) {
          await detail
            .locator('.step-editor__content:visible .el-input-number input')
            .first()
            .fill('1')
          await detail.getByRole('tab', { name: /单位换算/ }).click()
          await expect(unitStatus).toHaveText('按 1 : 1 换算')
          await expect(detail.locator('.step-editor__equation')).toContainText('1 工序单位')
          await detail.screenshot({ path: info.outputPath('process-unit-default.png') })
        }
        await detail.getByRole('tab', { name: /活动信息/ }).click()
        const activityTable = detail.locator('.art-table.process-activity-table')
        if (edit) {
          await detail
            .getByRole('textbox', { name: '第 1 行活动名称', exact: true })
            .fill('调整后的活动')
          await detail.getByRole('spinbutton', { name: '第 1 行基本数量', exact: true }).fill('0')
          await detail.getByRole('button', { name: '新增活动', exact: true }).click()
          await detail
            .getByRole('textbox', { name: '第 2 行活动名称', exact: true })
            .fill('新增排序活动')
          await activityTable.getByRole('button', { name: '上移活动', exact: true }).nth(1).click()
          await expect(
            detail.getByRole('textbox', { name: '第 1 行活动名称', exact: true })
          ).toHaveValue('新增排序活动')
          await activityTable.getByRole('button', { name: '下移活动', exact: true }).first().click()
          await expect(
            detail.getByRole('textbox', { name: '第 1 行活动名称', exact: true })
          ).toHaveValue('调整后的活动')
          await expect(
            detail.getByRole('spinbutton', { name: '第 1 行基本数量', exact: true })
          ).toHaveValue('0.000000')
          await detail.screenshot({ path: info.outputPath('process-activity-edit.png') })
          await activityTable.getByRole('button', { name: '删除活动', exact: true }).nth(1).click()
          await expect(
            activityTable.getByRole('button', { name: '删除活动', exact: true })
          ).toHaveCount(1)
          await expect(
            detail.getByRole('textbox', { name: '第 1 行活动名称', exact: true })
          ).toHaveValue('调整后的活动')
          await activityTable.getByRole('button', { name: '删除活动', exact: true }).click()
          await expect(activityTable).toContainText('暂无活动配置')
          await expect
            .poll(() =>
              activityTable
                .locator('.el-table__body-wrapper .el-scrollbar__wrap')
                .evaluate((element) => element.scrollLeft)
            )
            .toBe(0)
          await detail
            .locator('.art-dialog__scrollbar > .el-scrollbar__wrap')
            .evaluate((element) => {
              element.scrollTop = element.scrollHeight
            })
          await expect(
            activityTable.getByRole('button', { name: '新增活动', exact: true })
          ).toBeInViewport({ ratio: 1 })
          await detail.screenshot({ path: info.outputPath('process-activity-empty.png') })
          await activityTable.getByRole('button', { name: '新增活动', exact: true }).click()
          await expect(
            detail.getByRole('textbox', { name: '第 1 行活动名称', exact: true })
          ).toBeVisible()
          expect(errors).toEqual([])
          return
        }
        await expect(activityTable).toContainText('12,345.678901')
        await expect(activityTable).toContainText('加工活动')
        await expect(activityTable).toContainText('无需维护检查')
        const identity = detail.locator('.step-editor__identity')
        const initialLeft = await identity.evaluate(
          (element) => element.getBoundingClientRect().left
        )
        await activityTable.getByText('12,345.678901', { exact: true }).scrollIntoViewIfNeeded()
        expect(
          await identity.evaluate((element) => element.getBoundingClientRect().left)
        ).toBeCloseTo(initialLeft, 0)
        expect(
          await detail
            .locator('.art-dialog__scrollbar > .el-scrollbar__wrap')
            .evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
        ).toBe(true)
        expect(
          await detail
            .locator('.process-activity-table .el-table__body-wrapper .el-scrollbar__wrap')
            .evaluate((element) => element.scrollWidth > element.clientWidth)
        ).toBe(true)
        await detail.screenshot({ path: info.outputPath('process-activity.png') })
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true
        )
        expect(errors).toEqual([])
      })
    }
  }
}
