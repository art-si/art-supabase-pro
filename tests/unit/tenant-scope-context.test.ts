import assert from 'node:assert/strict'
import test from 'node:test'
import { loadAllDocumentPages } from '../../src/utils/business/document-detail-list'
import { fetchAllRangePages } from '../../src/utils/supabase/pagination'
import {
  createTenantScopeReadGuard,
  readTenantScopeId,
  readPlatformTenantScopeActive,
  readMutationTenantScopeId,
  normalizePlatformTenantReadUrl,
  resolveTenantScopeId,
  resolveTenantWorkspaceId,
  resolveTenantWriteTargetId,
  shouldAttachTenantScopeHeader,
  TENANT_SCOPE_MODE_STORAGE_KEY,
  TENANT_SCOPE_STORAGE_KEY,
  writePlatformTenantScopeActive,
  writeTenantScopeId
} from '../../src/utils/tenant-scope-context'

test('tenant-bound workspaces prefer the selected tenant and fall back to the home tenant', () => {
  assert.equal(
    resolveTenantWorkspaceId(
      '7529f951-938e-4e2c-ac0d-316c136ae1f9',
      '028e6a68-a9db-4055-974c-1e05bfe94b0f'
    ),
    '7529f951-938e-4e2c-ac0d-316c136ae1f9'
  )
  assert.equal(
    resolveTenantWorkspaceId(null, '028e6a68-a9db-4055-974c-1e05bfe94b0f'),
    '028e6a68-a9db-4055-974c-1e05bfe94b0f'
  )
  assert.equal(resolveTenantWorkspaceId(null, null), '')
})

test('tenant-owned writes prefer an explicit target and default to the actor tenant', () => {
  const ownTenantId = '028e6a68-a9db-4055-974c-1e05bfe94b0f'
  const otherTenantId = '7529f951-938e-4e2c-ac0d-316c136ae1f9'

  assert.equal(
    resolveTenantWriteTargetId({
      explicitTenantId: otherTenantId,
      effectiveTenantId: null,
      actorTenantId: ownTenantId,
      canWriteToOtherTenant: true
    }),
    otherTenantId
  )
  assert.equal(
    resolveTenantWriteTargetId({
      effectiveTenantId: otherTenantId,
      actorTenantId: ownTenantId,
      canWriteToOtherTenant: true
    }),
    otherTenantId
  )
  assert.equal(
    resolveTenantWriteTargetId({
      effectiveTenantId: ownTenantId,
      actorTenantId: ownTenantId,
      canWriteToOtherTenant: false
    }),
    ownTenantId
  )
  assert.equal(
    resolveTenantWriteTargetId({ actorTenantId: ownTenantId, canWriteToOtherTenant: true }),
    ownTenantId
  )
  assert.throws(
    () => resolveTenantWriteTargetId({ canWriteToOtherTenant: true }),
    /请先选择目标租户/
  )
  assert.throws(
    () =>
      resolveTenantWriteTargetId({
        explicitTenantId: otherTenantId,
        effectiveTenantId: ownTenantId,
        actorTenantId: ownTenantId,
        canWriteToOtherTenant: false
      }),
    /目标租户与当前选择不一致/
  )
  assert.throws(
    () =>
      resolveTenantWriteTargetId({
        explicitTenantId: otherTenantId,
        effectiveTenantId: ownTenantId,
        actorTenantId: ownTenantId,
        canWriteToOtherTenant: true
      }),
    /目标租户与当前选择不一致/
  )
  assert.throws(
    () =>
      resolveTenantWriteTargetId({
        explicitTenantId: otherTenantId,
        actorTenantId: ownTenantId,
        canWriteToOtherTenant: false
      }),
    /只能操作当前账号所属租户/
  )
  assert.throws(
    () => resolveTenantWriteTargetId({ explicitTenantId: '../other', canWriteToOtherTenant: true }),
    /目标租户无效/
  )
})

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()

  get length(): number {
    return this.values.size
  }

  clear(): void {
    this.values.clear()
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

test('tenant scope context persists only valid concrete tenant UUIDs', () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
  const storage = new MemoryStorage()
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: storage })

  try {
    const tenantId = '7529f951-938e-4e2c-ac0d-316c136ae1f9'
    writeTenantScopeId(tenantId)
    assert.equal(readTenantScopeId(), tenantId)
    assert.equal(resolveTenantScopeId(), tenantId)
    assert.equal(
      resolveTenantScopeId('a6f21b7d-bca8-4698-a72a-b6df251bf07c'),
      'a6f21b7d-bca8-4698-a72a-b6df251bf07c'
    )

    storage.setItem(TENANT_SCOPE_STORAGE_KEY, 'not-a-tenant-id')
    assert.equal(readTenantScopeId(), null)
    assert.equal(resolveTenantScopeId(), undefined)

    writeTenantScopeId(null)
    assert.equal(storage.getItem(TENANT_SCOPE_STORAGE_KEY), null)
  } finally {
    if (originalDescriptor) {
      Object.defineProperty(globalThis, 'sessionStorage', originalDescriptor)
    } else {
      Reflect.deleteProperty(globalThis, 'sessionStorage')
    }
  }
})

test('platform scope state is explicit even when all tenants is selected', () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
  const storage = new MemoryStorage()
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: storage })

  try {
    writePlatformTenantScopeActive(true)
    assert.equal(readPlatformTenantScopeActive(), true)
    assert.equal(storage.getItem(TENANT_SCOPE_MODE_STORAGE_KEY), '1')

    writePlatformTenantScopeActive(false)
    assert.equal(readPlatformTenantScopeActive(), false)
  } finally {
    if (originalDescriptor) {
      Object.defineProperty(globalThis, 'sessionStorage', originalDescriptor)
    } else {
      Reflect.deleteProperty(globalThis, 'sessionStorage')
    }
  }
})

test('paged reads reject platform scope changes and ignore forged ordinary scope', async () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
  const ownTenant = '028e6a68-a9db-4055-974c-1e05bfe94b0f'
  const otherTenant = '7529f951-938e-4e2c-ac0d-316c136ae1f9'
  try {
    for (const mode of ['platform-all', 'platform-selected', 'ordinary-own', 'ordinary-forged']) {
      const storage = new MemoryStorage()
      Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: storage })
      const platform = mode.startsWith('platform-')
      writePlatformTenantScopeActive(platform)
      writeTenantScopeId(mode === 'platform-selected' ? ownTenant : null)
      if (mode === 'ordinary-forged') storage.setItem(TENANT_SCOPE_STORAGE_KEY, otherTenant)
      let requests = 0
      const read = loadAllDocumentPages(
        async () => {
          requests += 1
          if (requests === 1) writeTenantScopeId(otherTenant)
          return { data: [requests], total: 2 }
        },
        {},
        1
      )
      if (platform) {
        await assert.rejects(read, /租户范围已变化/)
        assert.equal(requests, 1)
      } else {
        assert.deepEqual(await read, [1, 2])
      }
    }
    writePlatformTenantScopeActive(true)
    writeTenantScopeId(null)
    const guard = createTenantScopeReadGuard()
    writeTenantScopeId(otherTenant)
    writeTenantScopeId(null)
    assert.throws(guard, /租户范围已变化/)
  } finally {
    if (originalDescriptor) Object.defineProperty(globalThis, 'sessionStorage', originalDescriptor)
    else Reflect.deleteProperty(globalThis, 'sessionStorage')
  }
})

test('Supabase range collection rejects changed platform scopes and preserves ordinary reads', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
  const ownTenant = '028e6a68-a9db-4055-974c-1e05bfe94b0f'
  const otherTenant = '7529f951-938e-4e2c-ac0d-316c136ae1f9'
  try {
    for (const mode of ['platform-all', 'platform-selected', 'ordinary-own', 'ordinary-forged']) {
      const storage = new MemoryStorage()
      Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: storage })
      const platform = mode.startsWith('platform-')
      writePlatformTenantScopeActive(platform)
      writeTenantScopeId(mode === 'platform-selected' ? ownTenant : null)
      if (mode === 'ordinary-forged') storage.setItem(TENANT_SCOPE_STORAGE_KEY, otherTenant)
      let requests = 0
      const read = fetchAllRangePages(
        async () => {
          requests++
          if (requests === 1) writeTenantScopeId(otherTenant)
          return { data: requests <= 2 ? [requests] : [], error: null }
        },
        { pageSize: 1 }
      )
      if (platform) {
        await assert.rejects(read, /租户范围已变化/)
        assert.equal(requests, 1)
      } else {
        assert.deepEqual((await read).data, [1, 2])
      }
    }
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'sessionStorage', descriptor)
    else Reflect.deleteProperty(globalThis, 'sessionStorage')
  }
})

test('platform table reads discard legacy tenant filters but preserve explicit filters and RPCs', () => {
  assert.equal(
    normalizePlatformTenantReadUrl(
      'https://example.supabase.co/rest/v1/mdm_production_department?select=*&tenant_id=eq.platform&enabled=eq.true'
    ),
    'https://example.supabase.co/rest/v1/mdm_production_department?select=*&tenant_id=eq.platform&enabled=eq.true'
  )
  assert.equal(
    normalizePlatformTenantReadUrl(
      'https://example.supabase.co/rest/v1/mdm_production_personnel?tenant_id=eq.selected&enabled=eq.true'
    ),
    'https://example.supabase.co/rest/v1/mdm_production_personnel?tenant_id=eq.selected&enabled=eq.true'
  )
  assert.equal(
    normalizePlatformTenantReadUrl(
      'https://example.supabase.co/rest/v1/mdm_work_center?tenant_id=eq.selected&code=ilike.%25A%25'
    ),
    'https://example.supabase.co/rest/v1/mdm_work_center?tenant_id=eq.selected&code=ilike.%25A%25'
  )
  assert.equal(
    normalizePlatformTenantReadUrl(
      'https://example.supabase.co/rest/v1/mdm_work_center_defaults?tenant_id=eq.selected&select=policy'
    ),
    'https://example.supabase.co/rest/v1/mdm_work_center_defaults?tenant_id=eq.selected&select=policy'
  )
  assert.equal(
    normalizePlatformTenantReadUrl(
      'https://example.supabase.co/rest/v1/mdm_employee?organization.tenant_id=eq.platform&name=ilike.%25A%25'
    ),
    'https://example.supabase.co/rest/v1/mdm_employee?name=ilike.%25A%25'
  )
  assert.equal(
    normalizePlatformTenantReadUrl(
      'https://example.supabase.co/rest/v1/rpc/list_people?tenant_id=platform'
    ),
    'https://example.supabase.co/rest/v1/rpc/list_people?tenant_id=platform'
  )
  assert.equal(
    normalizePlatformTenantReadUrl(
      'https://example.supabase.co/rest/v1/sys_document_number_rule?tenant_id=eq.selected&enabled=eq.true'
    ),
    'https://example.supabase.co/rest/v1/sys_document_number_rule?tenant_id=eq.selected&enabled=eq.true'
  )
  assert.equal(
    normalizePlatformTenantReadUrl(
      'https://example.supabase.co/rest/v1/sys_attachment?tenant_id=eq.target&hash=eq.filehash'
    ),
    'https://example.supabase.co/rest/v1/sys_attachment?tenant_id=eq.target&hash=eq.filehash'
  )
  assert.equal(
    normalizePlatformTenantReadUrl(
      'https://example.supabase.co/rest/v1/sys_role?tenant_id=eq.target&enabled=eq.true'
    ),
    'https://example.supabase.co/rest/v1/sys_role?tenant_id=eq.target&enabled=eq.true'
  )
  for (const table of [
    'hr_candidate',
    'hr_competency',
    'hr_employee_competency',
    'hr_employee_contract',
    'hr_employee_qualification',
    'hr_personnel_change',
    'hr_position_competency',
    'hr_position_headcount',
    'hr_recruitment_requisition',
    'hr_training_enrollment',
    'hr_training_plan',
    'sys_user',
    'mdm_master_group',
    'mdm_document_type',
    'mdm_business_type',
    'mdm_equipment',
    'pmis_department_setting',
    'pmis_plan',
    'pmis_repair_task',
    'pmis_task',
    'scm_order_target_document',
    'wms_purchase_document_list'
  ]) {
    const url = `https://example.supabase.co/rest/v1/${table}?tenant_id=eq.target&status=eq.active`
    assert.equal(normalizePlatformTenantReadUrl(url), url)
  }
})

test('tenant scope header is attached only to Supabase Data API requests', () => {
  assert.equal(
    shouldAttachTenantScopeHeader('https://example.supabase.co/rest/v1/sys_user?select=*'),
    true
  )
  assert.equal(
    shouldAttachTenantScopeHeader(
      'https://example.supabase.co/rest/v1/rpc/get_platform_tenant_options'
    ),
    true
  )
  assert.equal(shouldAttachTenantScopeHeader('/rest/v1/sys_tenant'), true)
  assert.equal(
    shouldAttachTenantScopeHeader(
      'https://example.api.tcloudbasegateway.com/v1/rdb/rest/sys_tenant?select=*'
    ),
    true
  )
  assert.equal(shouldAttachTenantScopeHeader('/v1/rdb/rest/rpc/get_current_user'), true)

  assert.equal(
    shouldAttachTenantScopeHeader('https://example.supabase.co/functions/v1/check_user_status'),
    false
  )
  assert.equal(
    shouldAttachTenantScopeHeader('https://example.supabase.co/auth/v1/token?grant_type=password'),
    false
  )
  assert.equal(
    shouldAttachTenantScopeHeader(
      'https://example.supabase.co/storage/v1/object/public/avatar/demo.png'
    ),
    false
  )
  assert.equal(shouldAttachTenantScopeHeader('not a Supabase request'), false)
})

test('platform read normalization supports CloudBase PostgreSQL Data API paths', () => {
  const normalized = normalizePlatformTenantReadUrl(
    'https://example.api.tcloudbasegateway.com/v1/rdb/rest/mdm_material?select=*&tenant_id=eq.tenant-a&status=eq.enabled'
  )
  const url = new URL(normalized)
  assert.equal(url.searchParams.has('tenant_id'), false)
  assert.equal(url.searchParams.get('status'), 'eq.enabled')
})

test('mutation tenant scope is read only from explicit table and supported RPC payloads', () => {
  const tenantId = '7529f951-938e-4e2c-ac0d-316c136ae1f9'
  assert.equal(readMutationTenantScopeId(JSON.stringify({ tenant_id: tenantId })), tenantId)
  assert.equal(
    readMutationTenantScopeId(JSON.stringify({ p_header: { tenant_id: tenantId } })),
    tenantId
  )
  assert.equal(
    readMutationTenantScopeId(JSON.stringify({ p_document: { tenant_id: tenantId } })),
    tenantId
  )
  assert.equal(readMutationTenantScopeId(JSON.stringify({ tenant_id: 'invalid' })), null)
  assert.equal(readMutationTenantScopeId('not-json'), null)
})

test('bulk mutations select a single explicit tenant and reject ambiguous tenant scopes', () => {
  const tenantId = '7529f951-938e-4e2c-ac0d-316c136ae1f9'
  const otherTenantId = '028e6a68-a9db-4055-974c-1e05bfe94b0f'
  assert.equal(
    readMutationTenantScopeId(JSON.stringify([{ tenant_id: tenantId }, { tenant_id: tenantId }])),
    tenantId
  )
  assert.equal(
    readMutationTenantScopeId(
      JSON.stringify([{ tenant_id: tenantId }, { tenant_id: otherTenantId }])
    ),
    null
  )
  assert.equal(readMutationTenantScopeId('[]'), null)
  for (const malformed of [null, false, 42, 'tenant', [], [{ tenant_id: tenantId }]]) {
    assert.equal(readMutationTenantScopeId(JSON.stringify({ p_header: malformed })), null)
  }
  assert.equal(
    readMutationTenantScopeId(
      JSON.stringify({ p_header: null, p_payload: { tenant_id: tenantId } })
    ),
    tenantId
  )
})
