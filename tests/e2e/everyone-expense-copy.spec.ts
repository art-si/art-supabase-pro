import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120000)

for (const config of [
  {
    kind: 'payee',
    resource: 'fms_payee_information',
    number: 'payee_name',
    copy: '复制',
    save: 'fms_payee_information'
  },
  {
    kind: 'travel',
    resource: 'fms_travel_application',
    number: 'application_no',
    copy: '复制出差申请',
    save: 'copy_fms_travel_application_draft_secure'
  },
  {
    kind: 'loan',
    resource: 'fms_travel_loan',
    number: 'loan_no',
    copy: '复制借款单',
    save: 'copy_fms_travel_loan_draft_secure'
  },
  {
    kind: 'repayment',
    resource: 'fms_travel_repayment',
    number: 'repayment_no',
    copy: '复制还款单',
    save: 'save_fms_travel_repayment_draft_entry_secure'
  },
  {
    kind: 'reimbursement',
    resource: 'fms_list_expense_reimbursements_secure',
    number: 'reimbursement_no',
    copy: '复制',
    save: 'fms_save_travel_reimbursement_draft_secure'
  }
]) {
  for (const mode of ['loan', 'reimbursement'].includes(config.kind)
    ? ['copy', 'rejected']
    : ['repayment', 'travel'].includes(config.kind)
      ? ['copy', 'edit']
      : ['copy']) {
    const editingRejected = mode === 'rejected'
    const editingRepayment = mode === 'edit' && config.kind === 'repayment'
    const editingTravel = mode === 'edit' && config.kind === 'travel'
    const editingExisting = editingRejected || editingRepayment || editingTravel
    const editingLoan = editingRejected && config.kind === 'loan'
    const editingReimbursement = editingRejected && config.kind === 'reimbursement'
    const saveLabel =
      config.kind === 'payee' ? '保存收款信息' : editingLoan ? '保存修改' : '保存草稿'
    const savedStatus = editingLoan ? 'rejected' : 'draft'
    const failureMessage =
      config.kind === 'reimbursement'
        ? '报销资料已变化，请核对后重试'
        : '借款资料已变化，请核对后重试'
    test(`${config.kind} ${editingRepayment || editingTravel ? '两张草稿编辑、撤权阻断和失败重试' : editingRejected ? '两张驳回单修改、失败重试与重新提交' : '两张来源单复制为独立草稿并保留组织'}`, async ({
      page
    }, info) => {
      const tenant = '11111111-1111-4111-8111-111111111111'
      const saved: Record<string, unknown>[] = []
      const childReferenceChecks: Array<{ p_table: string; p_ids: string[] }> = []
      let blockedChildTable = ''
      let saveAttempts = 0
      let saveFail = editingExisting
      const reasonPrefix = editingExisting ? '整改后事由' : '新草稿事由'
      const loan = {
        id: 'source-loan',
        tenant_id: tenant,
        loan_no: 'JK-COPY-SOURCE',
        applicant_employee_id: 'employee',
        applicant_name: '验收员工',
        expense_department_id: 'department',
        expense_department_name: '验收部门',
        remaining_balance: 500,
        available_amount: 500,
        items: [
          {
            id: 'source-loan-item',
            amount: 500,
            purpose: '原借款事项',
            expense_item_name: '验收项目',
            currency_code: 'CNY',
            exchange_rate: 1
          }
        ]
      }
      const records = [1, 2].map((index) => ({
        id: `copy-source-${index}`,
        tenant_id: tenant,
        [config.number]: `QA-COPY-${index}`,
        status: editingRejected
          ? 'rejected'
          : editingTravel || config.kind === 'repayment'
            ? 'draft'
            : 'approved',
        source_type: 'travel',
        is_demo: true,
        is_employee: false,
        is_default: true,
        authorized_use: false,
        payee_name: `QA-COPY-${index}`,
        bank_name: '验收银行',
        bank_account: `622200000000000${index}`,
        currency_code: 'CNY',
        organization_id: 'department',
        cost_company_id: 'company',
        applicant_employee_id: 'employee',
        applicant_name: '验收员工',
        applicant_name_snapshot: '验收员工',
        applicant_employee_no: 'QA001',
        applicant_organization_id: 'department',
        assignment_id: 'assignment',
        expense_department_id: 'department',
        expense_department_name: '验收部门',
        application_date: '2026-10-01',
        reimbursement_date: '2026-10-01',
        repayment_date: '2026-10-20',
        planned_payment_date: '2026-10-24',
        travel_type: 'domestic',
        multiple_travelers: false,
        multiple_reimbursees: false,
        reason: `复制验收事由${index}`,
        remark: '原单备注',
        attachment_urls: [],
        basis_urls: [],
        requested_amount: 100,
        loan_amount: 100,
        total_amount: 100,
        amount: 100,
        approved_amount: editingRejected ? null : 100,
        paid_amount: editingRejected ? 0 : 100,
        received_amount: 100,
        travel_loan_id:
          config.kind === 'reimbursement' ? (editingRejected ? null : 'previous-loan') : undefined,
        loan_offset_amount: 0,
        cash_payable_amount: 100,
        loan_id: 'source-loan',
        loan: config.kind === 'repayment' ? loan : undefined,
        payments: editingRejected ? [] : [{ id: 'old-payment', amount: 100 }],
        receipts: [],
        itineraries: [
          {
            id: `old-line-${index}`,
            departure_place: '验收出发地',
            departure_region_path: [],
            destination_place: '验收目的地',
            destination_region_path: [],
            start_date: '2026-10-24',
            end_date: '2026-10-25',
            transport_modes: [],
            traveler_employee_ids: [],
            expense_item_id: 'expense',
            requested_amount: 100
          }
        ],
        items: [
          {
            id: `old-line-${index}`,
            expense_item_id: 'expense',
            purpose: '验收借款用途',
            borrower_employee_id: 'employee',
            loan_item_id: 'source-loan-item',
            amount: 100,
            remark: null
          }
        ],
        travel_lines: [
          {
            id: `old-line-${index}`,
            expense_item_id: 'expense',
            expense_item_name_snapshot: '验收项目',
            occurred_on: '2026-10-23',
            gross_amount: 100,
            tax_amount: 0,
            tax_rate: 0
          }
        ],
        payees: [
          {
            id: `old-payee-${index}`,
            settlement_method: 'bank_transfer',
            payee_type: 'person',
            payee_information_id: 'payee',
            payee_name: '验收收款人',
            payee_name_snapshot: '验收收款人',
            bank_name: '验收银行',
            bank_name_snapshot: '验收银行',
            bank_account: '6222000000000001',
            bank_account_snapshot: '6222000000000001',
            amount: 100
          }
        ]
      }))
      if (editingTravel)
        records.forEach((record, index) =>
          record.itineraries.push({
            ...record.itineraries[0],
            id: `old-line-remaining-${index + 1}`,
            departure_place: '保留出发地',
            destination_place: '保留目的地'
          })
        )
      if (editingReimbursement)
        records.forEach((record, index) => {
          record.travel_lines.push({
            ...record.travel_lines[0],
            id: `old-line-remaining-${index + 1}`
          })
          record.payees.push({ ...record.payees[0], id: `old-payee-remaining-${index + 1}` })
        })
      await page.route('**/rest/v1/**', (route) => {
        const url = new URL(route.request().url())
        const resource = url.pathname.split('/').at(-1)
        if (resource === 'sys_dictionary') {
          const code = (url.searchParams.get('dict_type_table.code') || '').replace(/^eq\./, '')
          const entries =
            code === 'fmsExpenseDocumentStatus' || code === 'tmsReimbursementApprovalStatus'
              ? [
                  ['draft', '草稿'],
                  ['rejected', '已驳回'],
                  ['pending_review', '审批中'],
                  ['approved', '已通过']
                ]
              : code === 'fmsSettlementMethod'
                ? [['bank_transfer', '银行转账']]
                : code === 'commonDocumentDisplayMode'
                  ? [
                      ['document', '单据'],
                      ['line', '明细']
                    ]
                  : []
          return route.fulfill({
            json: entries.map(([value, label]) => ({
              id: value,
              code: value,
              value,
              label,
              status: '1',
              dict_type_table: { code }
            }))
          })
        }
        if (
          resource ===
            (editingLoan
              ? 'save_fms_travel_loan_draft_secure'
              : editingTravel
                ? 'save_fms_travel_application_draft_secure'
                : config.save) &&
          route.request().method() === 'POST'
        ) {
          const payload = route.request().postDataJSON() as Record<string, unknown>
          saveAttempts++
          if (saveFail)
            return route.fulfill({
              status: 409,
              json: { code: 'P0001', message: failureMessage }
            })
          saved.push(payload)
          if (editingExisting) {
            const values = payload.p_payload as Record<string, unknown>
            const record = records.find((row) => row.id === values.id)
            expect(record).toBeDefined()
            if (record) Object.assign(record, values, { status: savedStatus })
            return route.fulfill({ json: { id: values.id, status: savedStatus } })
          }
          return route.fulfill({
            json: { id: `new-copy-${saved.length}`, status: 'draft', ...payload }
          })
        }
        if (editingRejected && resource === 'start_workflow') {
          const body = route.request().postDataJSON()
          expect(body.p_business_type).toBe(
            editingLoan ? 'fms_travel_loan' : 'tms_expense_reimbursement'
          )
          const record = records.find((row) => row.id === body.p_business_id)
          expect(record?.status).toBe(savedStatus)
          if (record) record.status = 'pending_review'
          return route.fulfill({ json: `resubmitted-${body.p_business_id}` })
        }
        if (resource === 'mdm_organization')
          return route.fulfill({
            json: [
              {
                id: 'company',
                tenant_id: tenant,
                organization_name: '验收公司',
                organization_code: 'C',
                organization_type: 'company',
                parent_id: null,
                status: '1'
              },
              {
                id: 'department',
                tenant_id: tenant,
                organization_name: '验收部门',
                organization_code: 'D',
                organization_type: 'department',
                parent_id: 'company',
                status: '1'
              }
            ]
          })
        if (resource === 'mdm_employee')
          return route.fulfill({
            json: [
              {
                id: 'employee',
                tenant_id: tenant,
                employee_name: '验收员工',
                employee_no: 'QA001',
                organization_id: 'department'
              }
            ]
          })
        if (resource === 'mdm_employee_assignment')
          return route.fulfill({
            json: [{ id: 'assignment', business_title: '验收职位', primary_assignment: true }]
          })
        if (resource === 'tms_expense_item')
          return route.fulfill({
            json: [{ id: 'expense', item_name: '验收项目', is_enabled: true }]
          })
        if (
          resource === 'get_record_delete_dependency_details' &&
          (editingLoan || editingRepayment || editingTravel || editingReimbursement)
        ) {
          const body = route.request().postDataJSON()
          childReferenceChecks.push(body)
          return route.fulfill({
            json:
              body.p_table === blockedChildTable
                ? [
                    {
                      resourceId: body.p_ids[0],
                      sourceTable: 'tms_expense_reimbursement',
                      recordId: 'child-reference',
                      recordNo: 'FYBX-CHILD-001',
                      recordSummary: '子表引用验收',
                      recordStatus: 'approved'
                    }
                  ]
                : []
          })
        }
        if (resource === 'fms_list_repayable_loans_secure') return route.fulfill({ json: [loan] })
        if (resource === 'fms_list_loan_payee_options_secure')
          return route.fulfill({
            json: [
              {
                id: 'payee',
                payee_name: '验收收款人',
                bank_name: '验收银行',
                bank_account: '6222000000000001',
                account_name: '验收收款人',
                employee_id: 'employee',
                is_default: true
              }
            ]
          })
        if (resource === 'fms_travel_loan' && config.kind === 'repayment')
          return route.fulfill({ json: loan })
        if (resource === 'tms_get_expense_reimbursement_secure')
          return route.fulfill({
            json: records.find((record) => record.id === route.request().postDataJSON().p_id)
          })
        if (resource !== config.resource) return route.fulfill({ json: [] })
        const id = url.searchParams.get('id')?.replace(/^eq\./, '')
        if (id) return route.fulfill({ json: records.find((record) => record.id === id) })
        return route.fulfill({
          json: config.kind === 'reimbursement' ? { records, total: 2 } : records,
          headers: { 'content-range': '0-1/2', 'access-control-expose-headers': 'content-range' }
        })
      })
      const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
      const permission =
        config.kind === 'loan'
          ? 'FinanceLoanApplication'
          : config.kind === 'travel'
            ? 'FinanceTravelApplication'
            : config.kind === 'repayment'
              ? 'FinanceRepayment'
              : 'FinanceExpenseReimbursement'
      const actions = editingExisting
        ? [
            'View',
            'Edit',
            'Submit',
            'Delete',
            'DeleteItem',
            'DeleteLine',
            'DeletePayee',
            'CopyItem',
            'CopyPayee'
          ]
        : config.kind === 'payee'
          ? []
          : ['View', 'Add', 'Copy']
      const ordinaryPermissions = actions.length
        ? `&permissions=${encodeURIComponent(actions.map((action) => `${permission}:${action}`).join(','))}`
        : ''
      await page.goto(
        `/tests/e2e/fixtures/receivable-workspace.html?kind=expense_${config.kind}&theme=${theme}&permissionControls${ordinaryPermissions}`
      )
      for (const index of [1, 2]) {
        const row = page.getByRole('row').filter({ hasText: `QA-COPY-${index}` })
        await expect(row).toBeVisible()
        if (editingRejected) await expect(row).toContainText('已驳回')
        if (config.kind === 'payee') {
          await row.getByRole('button', { name: '更多操作', exact: true }).click()
          await page.getByRole('menuitem', { name: config.copy, exact: true }).click()
        } else
          await row
            .getByRole('button', { name: editingExisting ? '编辑' : config.copy, exact: true })
            .click()
        const dialog = page.getByRole('dialog').filter({
          hasText: config.kind === 'payee' ? '复制收款信息' : saveLabel
        })
        await expect(dialog).toBeVisible()
        if (editingReimbursement) {
          for (const child of [
            {
              index: 0,
              table: 'fms_expense_reimbursement_line',
              label: '费用明细',
              key: 'Alt+Shift+L'
            },
            {
              index: 1,
              table: 'fms_expense_reimbursement_payee',
              label: '收款明细',
              key: 'Alt+Shift+P'
            }
          ]) {
            await expect(page.locator('.el-message')).toHaveCount(0)
            const table = dialog.locator('.el-table__body-wrapper').nth(child.index)
            await expect(table.getByRole('row')).toHaveCount(2)
            blockedChildTable = child.table
            await table
              .getByRole('row')
              .first()
              .getByRole('button', { name: '删除', exact: true })
              .click()
            const block = page.getByRole('dialog', {
              name: `暂时无法删除${child.label}`,
              exact: true
            })
            await expect(block).toContainText('FYBX-CHILD-001')
            if (index === 2)
              await block.screenshot({ path: info.outputPath(`${child.table}-reference.png`) })
            await block.getByRole('button', { name: '关闭', exact: true }).click()
            await expect(table.getByRole('row')).toHaveCount(2)
            blockedChildTable = ''
            await table
              .getByRole('row')
              .first()
              .getByRole('button', { name: '删除', exact: true })
              .click()
            await page.keyboard.press(child.key)
            await page
              .getByRole('dialog', { name: '删除确认', exact: true })
              .getByRole('button', { name: '删除', exact: true })
              .click()
            await expect(
              page.getByText('删除权限已变化，请刷新页面后重试', { exact: true })
            ).toBeVisible()
            await expect(table.getByRole('row')).toHaveCount(2)
            await page.keyboard.press('Alt+Shift+5')
            await table
              .getByRole('row')
              .first()
              .getByRole('button', { name: '删除', exact: true })
              .click()
            await page
              .getByRole('dialog', { name: '删除确认', exact: true })
              .getByRole('button', { name: '删除', exact: true })
              .click()
            await expect(table.getByRole('row')).toHaveCount(1)
          }
        }
        if (editingTravel) {
          const itinerary = dialog.locator('article').filter({ hasText: '验收出发地 → 验收目的地' })
          await expect(itinerary).toBeVisible()
          blockedChildTable = 'fms_travel_itinerary'
          await itinerary.getByRole('button', { name: '删除', exact: true }).click()
          const block = page.getByRole('dialog', { name: '暂时无法删除行程', exact: true })
          await expect(block).toContainText('FYBX-CHILD-001')
          if (index === 2)
            await block.screenshot({ path: info.outputPath('travel-itinerary-reference.png') })
          await block.getByRole('button', { name: '关闭', exact: true }).click()
          await expect(itinerary).toBeVisible()
          blockedChildTable = ''
          await itinerary.getByRole('button', { name: '删除', exact: true }).click()
          await page
            .getByRole('dialog', { name: '删除确认', exact: true })
            .getByRole('button', { name: '删除', exact: true })
            .click()
          await expect(itinerary).toHaveCount(0)
          await expect(dialog.getByText('保留出发地 → 保留目的地', { exact: true })).toBeVisible()
        }
        if (editingRepayment) {
          await expect(page.locator('.el-message')).toHaveCount(0)
          const itemTable = dialog.locator('.el-table__body-wrapper').first()
          await itemTable.getByRole('button', { name: '复制明细', exact: true }).click()
          const itemCopy = page.getByRole('dialog', { name: '复制还款明细', exact: true })
          await expect(itemCopy).toBeVisible()
          await page.keyboard.press('Alt+Shift+I')
          await itemCopy.getByRole('button', { name: '添加明细', exact: true }).click()
          await expect(
            page.getByText('操作范围或权限已变化，请重新打开还款明细', { exact: true })
          ).toBeVisible()
          await expect(itemTable.getByRole('row')).toHaveCount(1)
          await page.keyboard.press('Alt+Shift+5')
          await itemCopy.getByRole('button', { name: '添加明细', exact: true }).click()
          await expect(itemCopy).not.toBeVisible()
          await expect(itemTable.getByRole('row')).toHaveCount(2)
          blockedChildTable = 'fms_travel_repayment_item'
          await itemTable
            .getByRole('row')
            .first()
            .getByRole('button', { name: '删除', exact: true })
            .click()
          const itemBlock = page.getByRole('dialog', { name: '暂时无法删除还款明细', exact: true })
          await expect(itemBlock).toContainText('FYBX-CHILD-001')
          await expect(itemTable.getByRole('row')).toHaveCount(2)
          if (index === 2)
            await itemBlock.screenshot({ path: info.outputPath('repayment-child-reference.png') })
          await itemBlock.getByRole('button', { name: '关闭', exact: true }).click()
          blockedChildTable = ''
          await itemTable
            .getByRole('row')
            .first()
            .getByRole('button', { name: '删除', exact: true })
            .click()
          await page
            .getByRole('dialog', { name: '删除确认', exact: true })
            .getByRole('button', { name: '删除', exact: true })
            .click()
          await expect(itemTable.getByRole('row')).toHaveCount(1)
        }
        if (editingLoan) {
          await dialog.getByRole('button', { name: '复制借款明细', exact: true }).click()
          const itemCopy = page.getByRole('dialog', { name: '复制借款明细', exact: true })
          await expect(itemCopy.getByRole('textbox', { name: /借款用途/ })).toHaveValue(
            '验收借款用途'
          )
          await itemCopy.getByRole('button', { name: '添加明细', exact: true }).click()
          await expect(itemCopy).toBeHidden()
          const itemTable = dialog.locator('.el-table__body-wrapper').nth(0)
          await expect(itemTable.getByRole('row')).toHaveCount(2)
          blockedChildTable = 'fms_travel_loan_item'
          await itemTable
            .getByRole('row')
            .first()
            .getByRole('button', { name: '删除', exact: true })
            .click()
          const itemBlock = page.getByRole('dialog', { name: '暂时无法删除借款明细', exact: true })
          await expect(itemBlock).toContainText('FYBX-CHILD-001')
          await expect(itemTable.getByRole('row')).toHaveCount(2)
          await itemBlock.getByRole('button', { name: '关闭', exact: true }).click()
          blockedChildTable = ''
          await itemTable
            .getByRole('row')
            .first()
            .getByRole('button', { name: '删除', exact: true })
            .click()
          await page
            .getByRole('dialog', { name: '删除确认', exact: true })
            .getByRole('button', { name: '删除', exact: true })
            .click()
          await expect(itemTable.getByRole('row')).toHaveCount(1)
          await dialog.getByRole('button', { name: '复制收款明细', exact: true }).click()
          const payeeCopy = page.getByRole('dialog', { name: '复制收款明细', exact: true })
          await payeeCopy.getByRole('button', { name: '添加收款明细', exact: true }).click()
          await expect(payeeCopy).toBeHidden()
          const payeeTable = dialog.locator('.el-table__body-wrapper').nth(1)
          await expect(payeeTable.getByRole('row')).toHaveCount(2)
          blockedChildTable = 'fms_travel_loan_payee'
          await payeeTable
            .getByRole('row')
            .first()
            .getByRole('button', { name: '删除', exact: true })
            .click()
          const payeeBlock = page.getByRole('dialog', { name: '暂时无法删除收款明细', exact: true })
          await expect(payeeBlock).toContainText('FYBX-CHILD-001')
          await expect(payeeTable.getByRole('row')).toHaveCount(2)
          await payeeBlock.getByRole('button', { name: '关闭', exact: true }).click()
          blockedChildTable = ''
          await payeeTable
            .getByRole('row')
            .first()
            .getByRole('button', { name: '删除', exact: true })
            .click()
          await page
            .getByRole('dialog', { name: '删除确认', exact: true })
            .getByRole('button', { name: '删除', exact: true })
            .click()
          await expect(payeeTable.getByRole('row')).toHaveCount(1)
        }
        if (!editingExisting && config.kind !== 'payee') {
          const children = ['loan', 'reimbursement'].includes(config.kind) ? 2 : 1
          await expect(dialog.getByRole('button', { name: '编辑', exact: true })).toHaveCount(
            children
          )
          await expect(dialog.getByRole('button', { name: '删除', exact: true })).toHaveCount(
            children
          )
        }
        if (config.kind !== 'payee') {
          const reason = dialog.getByRole('textbox', { name: /事由$/ })
          await expect(reason).toHaveValue(`复制验收事由${index}`)
          await reason.fill(`${reasonPrefix}${index}`)
        }
        if (index === 2) {
          await expect(page.locator('.el-message')).toHaveCount(0)
          await page.screenshot({
            path: info.outputPath(`${config.kind}-${mode}.png`),
            fullPage: true
          })
        }
        if (editingRepayment || editingTravel || editingReimbursement) {
          const before = saveAttempts
          await page.keyboard.press('Alt+Shift+4')
          await dialog.getByRole('button', { name: saveLabel, exact: true }).click()
          await expect(
            page.getByText(
              editingReimbursement
                ? '操作范围或权限已变化，请重新打开报销单'
                : editingTravel
                  ? '操作范围或权限已变化，请重新打开出差申请'
                  : '操作范围或权限已变化，请重新打开还款单',
              { exact: true }
            )
          ).toBeVisible()
          expect(saveAttempts).toBe(before)
          await page.keyboard.press('Alt+Shift+5')
        }
        await dialog
          .getByRole('button', {
            name: saveLabel,
            exact: true
          })
          .click()
        if (editingExisting && index === 1) {
          await expect(page.getByText(failureMessage, { exact: true })).toBeVisible()
          await expect(dialog.getByRole('textbox', { name: /事由$/ })).toHaveValue(
            `${reasonPrefix}${index}`
          )
          saveFail = false
          await dialog.getByRole('button', { name: saveLabel, exact: true }).click()
        }
        await expect(dialog).not.toBeVisible()
        if (editingRepayment || editingTravel)
          await expect(row).toContainText(`${reasonPrefix}${index}`)
        if (editingRejected) {
          await expect(row).toContainText(editingLoan ? '已驳回' : '草稿')
          await expect(row.getByRole('button', { name: '编辑', exact: true })).toBeEnabled()
          await row.getByRole('button', { name: '提交审批', exact: true }).click()
          await page
            .getByRole('dialog')
            .getByRole('button', { name: '提交审批', exact: true })
            .click()
          if (editingLoan)
            await expect(row.getByRole('button', { name: '编辑', exact: true })).toBeDisabled()
          else await expect(row.getByRole('button', { name: '编辑', exact: true })).toHaveCount(0)
          await expect(row).toContainText('审批中')
          await expect(row.getByRole('button', { name: '提交审批', exact: true })).toHaveCount(0)
        }
      }
      expect(saved).toHaveLength(2)
      for (const [index, body] of saved.entries()) {
        const payload = config.kind === 'payee' ? body : (body.p_payload as Record<string, unknown>)
        if (editingExisting) expect(payload.id).toBe(`copy-source-${index + 1}`)
        else expect(payload.id).toBeUndefined()
        expect(payload.tenant_id).toBe(tenant)
        for (const key of [
          'status',
          'approved_amount',
          'paid_amount',
          'received_amount',
          'payments',
          'receipts'
        ])
          expect(payload).not.toHaveProperty(key)
        if (config.kind === 'payee') expect(payload.is_default).toBe(false)
        else {
          expect(payload.reason).toBe(`${reasonPrefix}${index + 1}`)
          expect(payload.expense_department_id ?? payload.loan_id).toBe(
            config.kind === 'repayment' ? 'source-loan' : 'department'
          )
        }
        if (!editingExisting && (config.kind === 'travel' || config.kind === 'loan'))
          expect(body.p_source_id).toBe(`copy-source-${index + 1}`)
        if (config.kind === 'reimbursement') {
          expect(payload.travel_loan_id).toBeNull()
          expect(payload.loan_offset_amount).toBe(0)
        }
        for (const key of ['p_lines', 'p_items', 'p_payees']) {
          const lines = body[key] as Record<string, unknown>[] | undefined
          if (lines)
            for (const line of lines) {
              if (editingExisting && !editingLoan && !editingRepayment)
                expect(line.id).toMatch(/^old-(line|payee)-/)
              else expect(line.id).toBeUndefined()
            }
        }
      }
      expect(saveAttempts).toBe(editingExisting ? 3 : 2)
      if (editingReimbursement) {
        for (const index of [1, 2]) {
          expect(childReferenceChecks).toContainEqual(
            expect.objectContaining({
              p_table: 'fms_expense_reimbursement_line',
              p_ids: [`old-line-${index}`]
            })
          )
          expect(childReferenceChecks).toContainEqual(
            expect.objectContaining({
              p_table: 'fms_expense_reimbursement_payee',
              p_ids: [`old-payee-${index}`]
            })
          )
          expect(saved[index - 1].p_lines).toEqual([
            expect.objectContaining({ id: `old-line-remaining-${index}`, gross_amount: 100 })
          ])
          expect(saved[index - 1].p_payees).toEqual([
            expect.objectContaining({ id: `old-payee-remaining-${index}`, amount: 100 })
          ])
        }
      }
      if (editingTravel) {
        for (const index of [1, 2]) {
          expect(childReferenceChecks).toContainEqual(
            expect.objectContaining({
              p_table: 'fms_travel_itinerary',
              p_ids: [`old-line-${index}`]
            })
          )
          expect(saved[index - 1].p_lines).toEqual([
            expect.objectContaining({
              id: `old-line-remaining-${index}`,
              departure_place: '保留出发地',
              destination_place: '保留目的地'
            })
          ])
        }
      }
      if (editingRepayment) {
        for (const index of [1, 2])
          expect(childReferenceChecks).toContainEqual(
            expect.objectContaining({
              p_table: 'fms_travel_repayment_item',
              p_ids: [`old-line-${index}`]
            })
          )
        for (const body of saved) expect(body.p_items).toHaveLength(1)
      }
      if (editingLoan) {
        for (const index of [1, 2]) {
          expect(childReferenceChecks).toContainEqual(
            expect.objectContaining({
              p_table: 'fms_travel_loan_item',
              p_ids: [`old-line-${index}`]
            })
          )
          expect(childReferenceChecks).toContainEqual(
            expect.objectContaining({
              p_table: 'fms_travel_loan_payee',
              p_ids: [`old-payee-${index}`]
            })
          )
        }
        for (const body of saved) {
          expect(body.p_items).toHaveLength(1)
          expect(body.p_payees).toHaveLength(1)
        }
      }
    })
  }
}
