import { expect, test, type Page, type Route } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(180_000)

const fixture = '/tests/e2e/fixtures/vms-vehicle-type-scope.html'
const ownTenant = '11111111-1111-4111-8111-111111111111'
const otherTenant = '22222222-2222-4222-8222-222222222222'
const ownProfileId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaa1'
const otherProfileId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'
const vehicleId = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3'
const trailerId = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd4'
const ruleId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee5'
const driverId = 'ffffffff-ffff-4fff-8fff-fffffffffff6'

function profile(tenantId: string, id: string, lengthM: number) {
  return {
    id,
    tenant_id: tenantId,
    category: '半挂车',
    image_url: null,
    length_m: lengthM,
    volume_m3: 68,
    load_tons: 30,
    status: '1',
    sort: 10,
    scheme_color: null,
    tag_style: null,
    remark: null
  }
}

const ownProfile = profile(ownTenant, ownProfileId, 13)
const otherProfile = profile(otherTenant, otherProfileId, 15)

async function isolate(page: Page) {
  await prepareIsolatedSession(page)
  const unexpected: string[] = []
  await page.route('**/rest/v1/**', (route) => {
    const request = route.request()
    if (request.method() === 'GET') {
      const endpoint = new URL(request.url()).pathname.split('/').at(-1)
      if (endpoint === 'sys_dictionary') {
        const code = new URL(request.url()).searchParams
          .get('dict_type_table.code')
          ?.replace(/^eq\./, '')
        const values: Record<string, Array<[string, string]>> = {
          commonEnabledStatus: [
            ['enabled', '启用'],
            ['disabled', '禁用']
          ],
          vehicleOperationStatus: [['running', '运营中']]
        }
        return route.fulfill({
          json: (values[code ?? ''] ?? []).map(([value, label], sort) => ({
            id: `${code}-${value}`,
            code: value,
            label,
            value,
            sort,
            status: '1',
            dict_type_table: { code, name: code }
          }))
        })
      }
      return route.fulfill({ json: [] })
    }
    unexpected.push(`${request.method()} ${new URL(request.url()).pathname}`)
    return route.fulfill({ status: 403, json: { message: 'Unexpected write' } })
  })
  return unexpected
}

function listRequest(route: Route) {
  return route.request().postDataJSON() as { p_tenant_id?: string; p_include_disabled?: boolean }
}

function dependency(sourceTable: string, id: string, tenantId = otherTenant) {
  return {
    resource_id: otherProfileId,
    source_table: sourceTable,
    record_id: `${sourceTable}:${id}`,
    target_id: id,
    record_no: '待补充',
    record_summary: '',
    record_status: '',
    created_at: '2026-01-01T00:00:00Z',
    tenant_id: tenantId
  }
}

async function waitForProfile(page: Page, length: number) {
  await expect(
    page.locator('.vehicle-type-tab__spec').filter({ hasText: `${length} 米` })
  ).toBeVisible({
    timeout: 90_000
  })
}

test('平台全部租户以父表单显式目标加载和保存该租户车型', async ({ page }) => {
  const unexpected = await isolate(page)
  const reads: string[] = []
  const saves: Array<{ p_id?: string | null; p_payload?: Record<string, unknown> }> = []
  await page.route('**/rest/v1/rpc/vms_list_vehicle_type_profiles_secure', (route) => {
    const request = listRequest(route)
    reads.push(String(request.p_tenant_id))
    return route.fulfill({
      json: [request.p_tenant_id === otherTenant ? otherProfile : ownProfile]
    })
  })
  await page.route('**/rest/v1/rpc/vms_save_vehicle_type_profile_secure', (route) => {
    const body = route.request().postDataJSON() as {
      p_id?: string | null
      p_payload?: Record<string, unknown>
    }
    saves.push(body)
    return route.fulfill({
      json: profile(otherTenant, body.p_id || 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb7', 17.5)
    })
  })
  await page.goto(`${fixture}?role=super&target=${otherTenant}`)
  await waitForProfile(page, 15)
  expect(reads).toContain(otherTenant)
  await page.getByRole('button', { name: '新增规格' }).click()
  await page.getByRole('spinbutton', { name: '车长，单位米' }).fill('17.5')
  const createButton = page.getByRole('button', { name: '创建规格' })
  await expect(createButton).toBeEnabled()
  await createButton.click()
  await expect.poll(() => saves.length).toBe(1)
  expect(saves[0].p_id).toBeFalsy()
  expect(saves[0].p_payload?.tenant_id).toBe(otherTenant)
  expect(unexpected).toEqual([])
})

for (const scenario of [
  { name: '平台具体租户', query: `role=super&header=selected&target=none` },
  { name: '普通用户伪造其他租户头', query: `role=ordinary&target=none&forge=1` }
]) {
  test(`${scenario.name}始终按当前授权租户查询车型`, async ({ page }) => {
    const unexpected = await isolate(page)
    const reads: string[] = []
    await page.route('**/rest/v1/rpc/vms_list_vehicle_type_profiles_secure', (route) => {
      const tenantId = listRequest(route).p_tenant_id
      reads.push(String(tenantId))
      return route.fulfill({ json: [ownProfile] })
    })
    await page.goto(`${fixture}?${scenario.query}`)
    await waitForProfile(page, 13)
    expect(reads).toEqual([ownTenant])
    expect(unexpected).toEqual([])
  })
}

test('普通用户显式指定其他租户时服务器拒绝读取且无写入', async ({ page }) => {
  const unexpected = await isolate(page)
  const reads: string[] = []
  await page.route('**/rest/v1/rpc/vms_list_vehicle_type_profiles_secure', (route) => {
    reads.push(String(listRequest(route).p_tenant_id))
    return route.fulfill({
      status: 403,
      json: { code: '42501', message: 'permission denied for tenant' }
    })
  })
  await page.goto(`${fixture}?role=ordinary&target=${otherTenant}`)
  await expect(page.getByText('内容加载失败', { exact: true })).toBeVisible()
  await expect(page.locator('.vehicle-type-tab__spec')).toHaveCount(0)
  expect(reads).toEqual([otherTenant])
  expect(unexpected).toEqual([])
})

test('父目标切换废弃慢响应并且旧保存结果不回写新租户', async ({ page }) => {
  const unexpected = await isolate(page)
  let releaseOldRead: (() => void) | undefined
  const oldRead = new Promise<void>((resolve) => {
    releaseOldRead = resolve
  })
  const reads: string[] = []
  let releaseSave: (() => void) | undefined
  const delayedSave = new Promise<void>((resolve) => {
    releaseSave = resolve
  })
  let saveStarted = false
  await page.route('**/rest/v1/rpc/vms_list_vehicle_type_profiles_secure', async (route) => {
    const tenantId = String(listRequest(route).p_tenant_id)
    reads.push(tenantId)
    if (tenantId === ownTenant && reads.length === 1) {
      await oldRead
      try {
        await route.fulfill({ json: [ownProfile] })
      } catch {
        /* aborted by new scope */
      }
      return
    }
    await route.fulfill({ json: [tenantId === otherTenant ? otherProfile : ownProfile] })
  })
  await page.route('**/rest/v1/rpc/vms_save_vehicle_type_profile_secure', async (route) => {
    saveStarted = true
    await delayedSave
    await route.fulfill({ json: otherProfile })
  })
  await page.goto(`${fixture}?role=super&target=${ownTenant}`)
  await expect.poll(() => reads.length).toBe(1)
  await page.getByRole('button', { name: '父表单选目标租户' }).click()
  await waitForProfile(page, 15)
  releaseOldRead?.()
  await expect(page.locator('.vehicle-type-tab__spec').filter({ hasText: '13 米' })).toHaveCount(0)
  await page.getByRole('button', { name: '保存更改' }).click()
  await expect.poll(() => saveStarted).toBe(true)
  await page.getByRole('button', { name: '父表单选本租户' }).click()
  await waitForProfile(page, 13)
  releaseSave?.()
  await expect(page.getByText('车型规格已保存', { exact: true })).toHaveCount(0)
  await expect(page.locator('.vehicle-type-tab__spec').filter({ hasText: '15 米' })).toHaveCount(0)
  expect(unexpected).toEqual([])
})

test('三类外键以名称状态和授权入口阻断删除', async ({ page }, testInfo) => {
  const unexpected = await isolate(page)
  const refs = [
    dependency('mdm_vehicle', vehicleId),
    dependency('vehicle_trailer', trailerId),
    dependency('tms_driver_commission_rule', ruleId)
  ]
  await page.route('**/rest/v1/rpc/vms_list_vehicle_type_profiles_secure', (route) =>
    route.fulfill({ json: [otherProfile] })
  )
  await page.route('**/rest/v1/rpc/get_record_delete_dependency_details**', (route) =>
    route.fulfill({ json: refs })
  )
  await page.route('**/rest/v1/mdm_vehicle?*', (route) =>
    route.fulfill({
      json: [
        { id: vehicleId, tenant_id: otherTenant, plate_no: '沪A-测试', operation_status: 'running' }
      ]
    })
  )
  await page.route('**/rest/v1/vehicle_trailer?*', (route) =>
    route.fulfill({
      json: [{ id: trailerId, tenant_id: otherTenant, plate_no: '沪B-挂车', status: 'active' }]
    })
  )
  await page.route('**/rest/v1/tms_driver_commission_rule?*', (route) =>
    route.fulfill({
      json: [
        {
          id: ruleId,
          tenant_id: otherTenant,
          driver_id: driverId,
          rule_name: '长途佣金规则',
          enabled: true
        }
      ]
    })
  )
  await page.goto(`${fixture}?role=super&target=${otherTenant}`)
  await waitForProfile(page, 15)
  await page.getByRole('button', { name: '删除规格' }).click()
  const guard = page.locator('.master-delete-guard')
  for (const name of ['沪A-测试', '沪B-挂车', '长途佣金规则'])
    await expect(guard.getByText(name, { exact: true })).toBeVisible()
  await expect(guard.getByText('运营中', { exact: true })).toBeVisible()
  await expect(guard.getByText('启用', { exact: true })).toBeVisible()
  await expect(guard.getByRole('button', { name: '查看关联' })).toHaveCount(3)
  await expect(page.getByRole('dialog', { name: '删除确认' })).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('vehicle-type-reference-guard.png') })
  for (const [index, navigation] of [
    { group: '车辆档案', path: `/vms/vehicle-archive-detail/${vehicleId}`, query: '' },
    { group: '挂车档案', path: '/vms/trailer-manage', query: `recordId=${trailerId}` },
    {
      group: '司机佣金规则',
      path: '/tms/basic-data/driver',
      query: `driverId=${driverId}&commissionRuleId=${ruleId}`
    }
  ].entries()) {
    if (index) {
      await page.goto(`${fixture}?role=super&target=${otherTenant}`)
      await waitForProfile(page, 15)
      await page.getByRole('button', { name: '删除规格' }).click()
    }
    await page
      .locator('.master-delete-guard__group')
      .filter({ hasText: navigation.group })
      .getByRole('button', { name: '查看关联' })
      .click()
    const currentRoute = page.locator('output[aria-label="当前业务路由"]')
    await expect(currentRoute).toContainText(navigation.path)
    if (navigation.query) await expect(currentRoute).toContainText(navigation.query)
  }
  expect(unexpected).toEqual([])
})

test('缺少源查看权限时共享 Guard 失败关闭', async ({ page }) => {
  const unexpected = await isolate(page)
  let checks = 0
  await page.route('**/rest/v1/rpc/vms_list_vehicle_type_profiles_secure', (route) =>
    route.fulfill({ json: [ownProfile] })
  )
  await page.route('**/rest/v1/rpc/get_record_delete_dependency_details**', (route) => {
    checks++
    return route.fulfill(
      checks === 1
        ? { status: 503, json: { code: 'XX000', message: 'technical detail' } }
        : { json: [] }
    )
  })
  await page.goto(`${fixture}?role=ordinary&target=none`)
  await waitForProfile(page, 13)
  await page.getByRole('button', { name: '删除规格' }).click()
  await expect(page.getByText('关联资料未完成核验，删除已停止')).toBeVisible()
  await expect(page.getByText('缺少')).toBeVisible()
  expect(checks).toBe(0)
  expect(unexpected).toEqual([])
})

test('关联读取失败阻断删除，重新检查后才能确认', async ({ page }) => {
  const unexpected = await isolate(page)
  let checks = 0
  let deletes = 0
  await page.route('**/rest/v1/rpc/vms_list_vehicle_type_profiles_secure', (route) =>
    route.fulfill({ json: [otherProfile] })
  )
  await page.route('**/rest/v1/rpc/get_record_delete_dependency_details**', (route) => {
    checks++
    return route.fulfill(
      checks === 1
        ? { status: 503, json: { code: 'XX000', message: 'technical detail' } }
        : { json: [] }
    )
  })
  await page.route('**/rest/v1/rpc/vms_delete_vehicle_type_profile_secure', (route) => {
    deletes++
    return route.fulfill({ json: true })
  })
  await page.goto(`${fixture}?role=super&target=${otherTenant}`)
  await waitForProfile(page, 15)
  await page.getByRole('button', { name: '删除规格' }).click()
  const failedGuard = page.getByRole('dialog', { name: '删除检查未完成' })
  await expect(failedGuard.getByText('关联资料未完成核验，删除已停止')).toBeVisible()
  expect(checks).toBe(1)
  expect(deletes).toBe(0)
  await failedGuard.getByRole('button', { name: '重新检查' }).click()
  await expect(failedGuard).toHaveCount(0)
  expect(checks).toBe(2)
  expect(deletes).toBe(0)
  await page.getByRole('button', { name: '删除规格' }).click()
  await expect(page.getByRole('dialog', { name: '删除确认' })).toBeVisible()
  expect(deletes).toBe(0)
  expect(unexpected).toEqual([])
})

test('无关联时先检查再确认并只删除原规格', async ({ page }) => {
  const unexpected = await isolate(page)
  let checks = 0
  const deletes: string[] = []
  await page.route('**/rest/v1/rpc/vms_list_vehicle_type_profiles_secure', (route) =>
    route.fulfill({ json: [otherProfile] })
  )
  await page.route('**/rest/v1/rpc/get_record_delete_dependency_details**', (route) => {
    checks++
    expect(route.request().postDataJSON()).toMatchObject({
      p_table: 'vehicle_type_profile',
      p_ids: [otherProfileId]
    })
    return route.fulfill({ json: [] })
  })
  await page.route('**/rest/v1/rpc/vms_delete_vehicle_type_profile_secure', (route) => {
    deletes.push(String((route.request().postDataJSON() as { p_id?: string }).p_id))
    return route.fulfill({ json: true })
  })
  await page.goto(`${fixture}?role=super&target=${otherTenant}`)
  await waitForProfile(page, 15)
  await page.getByRole('button', { name: '删除规格' }).click()
  const confirmation = page.getByRole('dialog', { name: '删除确认' })
  await expect(confirmation).toBeVisible()
  expect(checks).toBe(1)
  expect(deletes).toEqual([])
  await confirmation.getByRole('button', { name: '删除', exact: true }).click()
  await expect.poll(() => deletes.length).toBe(1)
  expect(deletes).toEqual([otherProfileId])
  expect(unexpected).toEqual([])
})

test('删除 RPC 返回 false 时保留规格并提示重检', async ({ page }) => {
  const unexpected = await isolate(page)
  let checks = 0
  let deletes = 0
  await page.route('**/rest/v1/rpc/vms_list_vehicle_type_profiles_secure', (route) =>
    route.fulfill({ json: [otherProfile] })
  )
  await page.route('**/rest/v1/rpc/get_record_delete_dependency_details**', (route) => {
    checks++
    return route.fulfill({ json: [] })
  })
  await page.route('**/rest/v1/rpc/vms_delete_vehicle_type_profile_secure', (route) => {
    deletes++
    return route.fulfill({ json: false })
  })
  await page.goto(`${fixture}?role=super&target=${otherTenant}`)
  await waitForProfile(page, 15)
  await page.getByRole('button', { name: '删除规格' }).click()
  await page
    .getByRole('dialog', { name: '删除确认' })
    .getByRole('button', { name: '删除', exact: true })
    .click()
  await expect(page.locator('.el-message--error')).toBeVisible()
  await waitForProfile(page, 15)
  expect(checks).toBe(2)
  expect(deletes).toBe(1)
  expect(unexpected).toEqual([])
})

test('并发外键拒绝后重查原规格并显示新关联挂车', async ({ page }) => {
  const unexpected = await isolate(page)
  let checks = 0
  let deletes = 0
  await page.route('**/rest/v1/rpc/vms_list_vehicle_type_profiles_secure', (route) =>
    route.fulfill({ json: [otherProfile] })
  )
  await page.route('**/rest/v1/rpc/get_record_delete_dependency_details**', (route) => {
    checks++
    const body = route.request().postDataJSON() as { p_constraint?: string | null }
    expect(body.p_constraint).toBe(
      checks === 1 ? null : 'vehicle_trailer_vehicle_type_profile_id_fkey'
    )
    return route.fulfill({
      json: checks === 1 ? [] : [dependency('vehicle_trailer', trailerId)]
    })
  })
  await page.route('**/rest/v1/vehicle_trailer?*', (route) =>
    route.fulfill({
      json: [{ id: trailerId, tenant_id: otherTenant, plate_no: '沪B-并发挂车', status: 'active' }]
    })
  )
  await page.route('**/rest/v1/rpc/vms_delete_vehicle_type_profile_secure', (route) => {
    deletes++
    return route.fulfill({
      status: 409,
      json: {
        code: '23503',
        message:
          'update or delete on table "vehicle_type_profile" violates foreign key constraint "vehicle_trailer_vehicle_type_profile_id_fkey"',
        details: `Key (id)=(${otherProfileId}) is still referenced from table "vehicle_trailer".`
      }
    })
  })
  await page.goto(`${fixture}?role=super&target=${otherTenant}`)
  await waitForProfile(page, 15)
  await page.getByRole('button', { name: '删除规格' }).click()
  await page
    .getByRole('dialog', { name: '删除确认' })
    .getByRole('button', { name: '删除', exact: true })
    .click()
  await expect(page.locator('.master-delete-guard').getByText('沪B-并发挂车')).toBeVisible()
  expect(checks).toBe(2)
  expect(deletes).toBe(1)
  expect(unexpected).toEqual([])
})

test('确认期间父表单换目标，旧确认不删除新旧租户记录', async ({ page }) => {
  const unexpected = await isolate(page)
  let deletes = 0
  await page.route('**/rest/v1/rpc/vms_list_vehicle_type_profiles_secure', (route) =>
    route.fulfill({
      json: [listRequest(route).p_tenant_id === otherTenant ? otherProfile : ownProfile]
    })
  )
  await page.route('**/rest/v1/rpc/get_record_delete_dependency_details**', (route) =>
    route.fulfill({ json: [] })
  )
  await page.route('**/rest/v1/rpc/vms_delete_vehicle_type_profile_secure', (route) => {
    deletes++
    return route.fulfill({ json: true })
  })
  await page.goto(`${fixture}?role=super&target=${ownTenant}`)
  await waitForProfile(page, 13)
  await page.getByRole('button', { name: '删除规格' }).click()
  const confirmation = page.getByRole('dialog', { name: '删除确认' })
  await expect(confirmation).toBeVisible()
  await page
    .getByRole('button', { name: '父表单选目标租户' })
    .evaluate((button: HTMLButtonElement) => button.click())
  await waitForProfile(page, 15)
  await confirmation.getByRole('button', { name: '删除', exact: true }).click()
  await expect(page.locator('.el-message--error')).toBeVisible()
  expect(deletes).toBe(0)
  expect(unexpected).toEqual([])
})

test('旧租户慢关联检查未返回时，新租户删除检查独立进行', async ({ page }) => {
  const unexpected = await isolate(page)
  let releaseOldCheck: (() => void) | undefined
  const oldCheck = new Promise<void>((resolve) => {
    releaseOldCheck = resolve
  })
  let oldCheckStarted = 0
  let oldCheckCompleted = 0
  let newChecks = 0
  let deletes = 0
  await page.route('**/rest/v1/rpc/vms_list_vehicle_type_profiles_secure', (route) =>
    route.fulfill({
      json: [listRequest(route).p_tenant_id === otherTenant ? otherProfile : ownProfile]
    })
  )
  await page.route('**/rest/v1/rpc/get_record_delete_dependency_details**', async (route) => {
    const body = route.request().postDataJSON() as { p_ids?: string[] }
    if (body.p_ids?.[0] === ownProfileId) {
      oldCheckStarted++
      await oldCheck
      try {
        await route.fulfill({ json: [] })
      } catch {
        // The old component can cancel its outstanding request on unmount.
      }
      oldCheckCompleted++
      return
    }
    expect(body.p_ids).toEqual([otherProfileId])
    newChecks++
    await route.fulfill({ json: [] })
  })
  await page.route('**/rest/v1/rpc/vms_delete_vehicle_type_profile_secure', (route) => {
    deletes++
    return route.fulfill({ json: true })
  })
  await page.goto(`${fixture}?role=super&target=${ownTenant}`)
  await waitForProfile(page, 13)
  await page.getByRole('button', { name: '删除规格' }).click()
  await expect.poll(() => oldCheckStarted).toBe(1)
  await page.getByRole('button', { name: '父表单选目标租户' }).click()
  await waitForProfile(page, 15)
  await page.getByRole('button', { name: '删除规格' }).click()
  const confirmation = page.getByRole('dialog', { name: '删除确认' })
  await expect(confirmation).toBeVisible()
  expect(newChecks).toBe(1)
  expect(oldCheckCompleted).toBe(0)
  expect(deletes).toBe(0)
  await confirmation.getByRole('button', { name: '取消' }).click()
  releaseOldCheck?.()
  await expect.poll(() => oldCheckCompleted).toBe(1)
  await expect(confirmation).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: '暂时无法删除车型规格' })).toHaveCount(0)
  await waitForProfile(page, 15)
  expect(deletes).toBe(0)
  expect(unexpected).toEqual([])
})
