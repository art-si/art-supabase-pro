import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { mockApplicationMenus } from './support/menu-rpc'

interface StoredBrowserState {
  origins?: Array<{
    localStorage?: Array<{ name: string; value: string }>
  }>
}

const menuMeta = (title: string, icon: string) => ({
  title,
  icon,
  roles: ['R_SUPER'],
  is_hide: false,
  is_enable: true,
  keep_alive: true
})

async function installFixtures(page: Page): Promise<void> {
  const authUser = {
    id: 'my-shift-auth-user',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'employee@example.invalid',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    created_at: '2026-01-01T00:00:00.000Z'
  }
  const root = {
    id: 'my-shift-mdm-root',
    parentId: null,
    name: 'MdmRoot',
    path: '/mdm',
    component: '/index/index',
    type: 'folder',
    sort: 1,
    meta: menuMeta('MDM主数据', 'ri:database-2-line')
  }
  const production = {
    id: 'my-shift-production-root',
    parentId: root.id,
    name: 'MdmProduction',
    path: 'production',
    component: '',
    type: 'folder',
    sort: 1,
    meta: menuMeta('生产主数据', 'ri:tools-line')
  }
  const pageMenu = {
    id: 'my-shift-page',
    parentId: production.id,
    name: 'MdmMyShiftSchedule',
    path: 'my-shift-schedule',
    component: '/mdm/production/my-shift-schedule',
    type: 'menu',
    sort: 5,
    meta: menuMeta('我的排班', 'ri:calendar-check-line')
  }
  await page.route('**/auth/v1/user', (route) => route.fulfill({ json: authUser }))
  await page.route('**/rest/v1/sys_param?*', (route) => route.fulfill({ json: [] }))
  await page.route('**/rest/v1/sys_user?*', (route) =>
    route.fulfill({
      json: {
        id: 'my-shift-system-user',
        auth_user_id: authUser.id,
        user_name: 'employee',
        nick_name: '员工',
        user_email: authUser.email,
        user_roles: ['R_EMPLOYEE'],
        status: '1'
      }
    })
  )
  await page.route('**/rest/v1/rpc/current_is_super', (route) => route.fulfill({ json: true }))
  await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
    route.fulfill({ json: [{ code: 'platform', name: '测试平台', baseUrl: '/' }] })
  )
  await mockApplicationMenus(page, { platform: [root, production, pageMenu] })
  await page.route('**/rest/v1/rpc/mdm_get_my_shift_schedule_secure', (route) =>
    route.fulfill({
      json: {
        profiles: [
          {
            personnelId: '00000000-0000-4000-8000-000000000201',
            employeeId: '00000000-0000-4000-8000-000000000202',
            employeeName: '张明',
            employeeNo: 'P-001',
            jobTitle: '装配技师',
            avatarUrl: null,
            departmentId: '00000000-0000-4000-8000-000000000101',
            departmentName: '总装一线',
            departmentCode: 'LINE-01',
            factory: '华东工厂'
          }
        ],
        schedules: [
          {
            id: '00000000-0000-4000-8000-000000000701',
            departmentId: '00000000-0000-4000-8000-000000000101',
            departmentName: '总装一线',
            departmentCode: 'LINE-01',
            factory: '华东工厂',
            patternName: '两班轮换',
            patternColor: '#5b5bd6',
            shiftName: '白班',
            shiftStartTime: '08:00',
            shiftEndTime: '17:00',
            dateMode: 'single',
            startDate: '2026-09-10',
            endDate: '2026-09-10',
            weekdays: [0, 1, 2, 3, 4, 5, 6],
            includeStatutoryHolidays: true,
            note: '请提前十分钟参加班前会'
          },
          {
            id: '00000000-0000-4000-8000-000000000702',
            departmentId: '00000000-0000-4000-8000-000000000101',
            departmentName: '总装一线',
            departmentCode: 'LINE-01',
            factory: '华东工厂',
            patternName: '两班轮换',
            patternColor: '#16a085',
            shiftName: '夜班',
            shiftStartTime: '20:00',
            shiftEndTime: '05:00',
            dateMode: 'range',
            startDate: '2026-09-14',
            endDate: '2026-09-30',
            weekdays: [1, 3, 5],
            includeStatutoryHolidays: false,
            note: ''
          }
        ],
        holidayDates: ['2026-09-18']
      }
    })
  )
}

async function installStoredAuthForCurrentOrigin(page: Page): Promise<void> {
  const state = JSON.parse(
    await readFile('playwright/.auth/user.json', 'utf8')
  ) as StoredBrowserState
  const entries = state.origins?.find((origin) =>
    origin.localStorage?.some((entry) => entry.name.includes('-auth-token'))
  )?.localStorage

  if (!entries?.length) throw new Error('缺少 Playwright 登录态，请先运行认证准备任务。')

  const durableEntries = entries.map((entry) => {
    if (!entry.name.includes('-auth-token')) return entry
    const session = JSON.parse(entry.value) as { expires_at?: number; expires_in?: number }
    session.expires_at = 4_102_444_800
    session.expires_in = 2_147_483_647
    return { ...entry, value: JSON.stringify(session) }
  })

  await page.addInitScript((storedEntries) => {
    storedEntries.forEach(({ name, value }) => localStorage.setItem(name, value))
  }, durableEntries)
}

test('我的排班清晰展示本人月历与选中日期详情', async ({ page }, testInfo) => {
  test.setTimeout(240_000)
  await page.clock.setFixedTime(new Date('2026-09-10T17:00:00+08:00'))
  await installStoredAuthForCurrentOrigin(page)
  await installFixtures(page)
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await page.goto('#/mdm/production/my-shift-schedule', { waitUntil: 'domcontentloaded' })
  const schedulePage = page.locator('.my-shift-schedule')
  await expect(schedulePage).toBeVisible({ timeout: 180_000 })
  const themeGuide = page.getByRole('button', { name: '知道了', exact: true })
  if (await themeGuide.isVisible()) await themeGuide.click()
  const expiredSessionNotice = page.locator('.el-notification').filter({
    hasText: '登录状态已失效'
  })
  if (await expiredSessionNotice.isVisible()) {
    await expiredSessionNotice.locator('.el-notification__closeBtn').click()
  }
  await page.evaluate(
    (settings) => {
      document.documentElement.classList.toggle('dark', settings.dark)
      document.documentElement.classList.toggle('shadow-mode', settings.shadow)
      document.documentElement.classList.toggle('border-mode', !settings.shadow)
    },
    {
      dark: testInfo.project.name.includes('dark'),
      shadow: testInfo.project.name.includes('shadow')
    }
  )
  await expect(page.getByRole('heading', { name: '我的排班', exact: true })).toBeVisible()
  await expect(page.getByText('张明', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('08:00', { exact: true }).last()).toBeVisible()
  await expect(page.getByText('请提前十分钟参加班前会', { exact: true })).toBeVisible()
  expect(
    await schedulePage.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
  ).toBe(true)

  await page.getByRole('button', { name: /9月14日，夜班/ }).click()
  await expect(page.getByText('20:00', { exact: true }).last()).toBeVisible()
  await expect(page.getByText('次日', { exact: true })).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('my-shift-schedule.png'),
    animations: 'disabled'
  })

  await page.route('**/rest/v1/rpc/mdm_get_my_shift_schedule_secure', (route) =>
    route.fulfill({ json: { profiles: [], schedules: [], holidayDates: [] } })
  )
  await page.getByRole('button', { name: '刷新排班', exact: true }).click()
  await expect(page.getByText('当前账号尚未关联生产人员', { exact: true })).toBeVisible()

  await page.route('**/rest/v1/rpc/mdm_get_my_shift_schedule_secure', (route) =>
    route.fulfill({ status: 500, json: { message: 'forced visual-test failure' } })
  )
  await page.getByRole('button', { name: '刷新排班', exact: true }).click()
  await expect(page.getByText('我的排班加载失败，请重试。', { exact: true })).toBeVisible()

  expect(pageErrors).toEqual([])
})
