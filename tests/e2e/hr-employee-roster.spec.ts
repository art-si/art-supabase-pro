import { expect, test, type Locator, type Page } from '@playwright/test'

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }))

  expect(
    overflow.scrollWidth,
    `页面产生横向溢出：scrollWidth=${overflow.scrollWidth}, clientWidth=${overflow.clientWidth}`
  ).toBeLessThanOrEqual(overflow.clientWidth + 1)
}

async function expectResourcePickerInsideUpload(container: Locator): Promise<void> {
  const placement = await container.evaluate((element) => {
    const upload = element.querySelector('.upload-container')?.getBoundingClientRect()
    const picker = element.querySelector('.resource-picker-action')?.getBoundingClientRect()
    if (!upload || !picker) return null

    return {
      header:
        picker.left >= upload.left &&
        picker.right <= upload.right &&
        picker.top >= upload.top &&
        picker.bottom <= upload.bottom &&
        picker.width >= upload.width - 4
    }
  })

  expect(placement, '资源库按钮应占据图片上传框的顶部').toEqual({ header: true })

  await container.locator('.resource-picker-action').hover()
  await expect
    .poll(
      () =>
        container.evaluate((element) => {
          const upload = element.querySelector('.upload-container')
          const picker = element.querySelector('.resource-picker-action')
          return Boolean(
            upload &&
            picker &&
            getComputedStyle(upload).borderTopColor === getComputedStyle(picker).color
          )
        }),
      { message: '悬停顶部文件选择区时整个上传框应变为蓝色虚线' }
    )
    .toBe(true)
}

test('员工花名册与新增用户选人入口可用', async ({ page }) => {
  test.setTimeout(120_000)
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await page.goto('#/hr/personnel/employee-roster', { waitUntil: 'domcontentloaded' })
  const rosterPage = page.locator('.hr-roster-page')
  await rosterPage.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => undefined)
  test.skip(
    !(await rosterPage.isVisible()),
    '当前 E2E 账号未授予员工花名册权限；请通过 E2E_EMAIL 使用 HR 管理员账号执行完整流程。'
  )
  await expect(page).not.toHaveURL(/#\/(?:auth\/)?login|#\/403/)
  await expect(rosterPage).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('.el-loading-mask:visible')).toHaveCount(0, { timeout: 60_000 })
  await expect(page.getByRole('heading', { name: '员工花名册' })).toBeVisible()
  await expect(page.getByText('人事档案按租户隔离', { exact: true })).toBeVisible()
  await expect(page.getByText('支持账号联动', { exact: true })).toBeVisible()
  await expect(page.getByText('组织导航', { exact: true })).toBeVisible()
  await expect(page.getByText('全部员工', { exact: true })).toBeVisible()
  await expectNoHorizontalOverflow(page)

  await page.getByRole('button', { name: '新增员工', exact: true }).click()
  await expect(page).toHaveURL(/#\/hr\/personnel\/employee-profile$/)
  await expect(page.locator('.hr-profile-page')).toBeVisible({ timeout: 60_000 })
  await expect(page.getByRole('heading', { name: '新增员工档案' })).toBeVisible()
  await expect(page.getByText('基础信息', { exact: true })).toBeVisible()
  await expect(page.getByText('劳动合同', { exact: false }).first()).toBeVisible()
  await expect(page.getByText('教育背景', { exact: false }).first()).toBeVisible()
  await expect(page.getByText('工作经历', { exact: false }).first()).toBeVisible()
  await expect(page.getByText('培训经历', { exact: false }).first()).toBeVisible()
  await expect(page.getByText('奖惩经历', { exact: false }).first()).toBeVisible()
  await expectResourcePickerInsideUpload(page.locator('.hr-profile-page__avatar'))
  await page.getByRole('tab', { name: /劳动合同/ }).click()
  const emptyBottomGap = await page.locator('.hr-profile-page__tabs').evaluate((tabs) => {
    const empty = tabs.querySelector('.hr-history-section__empty')?.getBoundingClientRect()
    return empty ? tabs.getBoundingClientRect().bottom - empty.bottom : null
  })
  expect(emptyBottomGap, '空状态背景应延伸到页签卡片底部内边距').not.toBeNull()
  expect(emptyBottomGap).toBeLessThanOrEqual(26)
  await page.getByRole('button', { name: '新增合同', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '合同编号', exact: true })).toBeVisible()
  await expect(page.getByText('合同 1', { exact: true })).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await expect(page).toHaveURL(/#\/hr\/personnel\/employee-roster$/)

  await page.goto('#/system/user', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.user-page')).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('.el-loading-mask:visible')).toHaveCount(0, { timeout: 60_000 })
  await page.getByRole('button', { name: '新增用户', exact: true }).click()

  const userDialog = page.getByRole('dialog', { name: '新增用户' })
  await expect(userDialog).toBeVisible()
  await expectResourcePickerInsideUpload(userDialog)
  await expect(userDialog.getByText('创建新的登录账号', { exact: true })).toBeVisible()
  await expect(userDialog.getByText('账号身份', { exact: true })).toBeVisible()
  await expect(userDialog.getByText('员工', { exact: true })).toBeVisible()
  await expect(userDialog.getByText('外部协作', { exact: true })).toBeVisible()
  await expect(userDialog.getByText('服务账号', { exact: true })).toBeVisible()
  await expect(userDialog.getByText('花名册员工', { exact: true })).toBeVisible()
  await expect(userDialog.getByText('必选；选择后自动回填员工身份、组织与联系方式。')).toBeVisible()
  await userDialog.getByText('外部协作', { exact: true }).click()
  await expect(userDialog.getByText('花名册员工', { exact: true })).toBeHidden()
  await expect(userDialog.getByText('账号用途说明', { exact: true })).toBeVisible()
  await userDialog.getByText('员工', { exact: true }).click()
  await expect(userDialog.getByText('花名册员工', { exact: true })).toBeVisible()
  const employeeSelector = userDialog.locator('.art-data-select__single-input')
  await expect(employeeSelector).toHaveCount(1)
  await employeeSelector.click()

  const employeeSelectorDialog = page.getByRole('dialog', { name: '从员工花名册选择' })
  await expect(employeeSelectorDialog).toBeVisible()
  await expect(
    employeeSelectorDialog.getByText('仅展示当前租户内在岗、且尚未开通账号的员工')
  ).toBeVisible()
  await expect(employeeSelectorDialog.getByText('员工工号', { exact: true })).toBeVisible()
  await expect(employeeSelectorDialog.getByText('员工姓名', { exact: true })).toBeVisible()
  await expect(page.locator('.el-loading-mask:visible')).toHaveCount(0, { timeout: 60_000 })
  await employeeSelectorDialog.getByRole('button', { name: '取消', exact: true }).click()
  await expect(employeeSelectorDialog).toBeHidden()
  await expectNoHorizontalOverflow(page)
  await userDialog.getByRole('button', { name: '取消', exact: true }).click()

  expect(pageErrors, `页面出现未捕获错误：\n${pageErrors.join('\n')}`).toEqual([])
})
