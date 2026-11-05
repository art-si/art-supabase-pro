import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { transformWithOxc } from 'vite'

test('tenant operation capture expires with actor, scope, permission, or route', async () => {
  const actor = { userId: 'same-user', tenantId: 'tenant-a', platformSuper: true }
  const context = { routeActive: true, permissionGranted: true }
  const tenantScope = {
    selectedTenantId: null as string | null,
    revision: 0,
    get effectiveTenantId(): string | null {
      return actor.platformSuper ? this.selectedTenantId : actor.tenantId
    }
  }
  const user = {
    get getUserInfo() {
      return actor
    },
    get isPlatformSuper() {
      return actor.platformSuper
    }
  }
  const filename = path.resolve('src/hooks/core/useTenantOperationGuard.ts')
  const source = readFileSync(filename, 'utf8')
  const imports = /^import .* from '.*'$/gm
  assert.equal([...source.matchAll(imports)].length, 4)
  const isolatedSource = `
    const useRouteOperationGuard = () => () => () => globalThis.__tenantGuardContext.routeActive
    const useAuth = () => ({ hasAuth: () => globalThis.__tenantGuardContext.permissionGranted })
    const useTenantScopeStore = () => globalThis.__tenantGuardScope
    const useUserStore = () => globalThis.__tenantGuardUser
  ${source.replace(imports, '')}`
  const transformed = await transformWithOxc(isolatedSource, filename, { lang: 'ts' })
  const url = `data:text/javascript;base64,${Buffer.from(transformed.code).toString('base64')}`
  const globals = ['__tenantGuardContext', '__tenantGuardScope', '__tenantGuardUser'] as const
  const priorGlobals = globals.map((name) => Object.getOwnPropertyDescriptor(globalThis, name))
  try {
    Reflect.set(globalThis, '__tenantGuardContext', context)
    Reflect.set(globalThis, '__tenantGuardScope', tenantScope)
    Reflect.set(globalThis, '__tenantGuardUser', user)
    const { useTenantOperationGuard } = (await import(
      url
    )) as typeof import('../../src/hooks/core/useTenantOperationGuard')
    const capture = useTenantOperationGuard()

    const platformAll = capture()
    assert.equal(platformAll(), true)
    actor.tenantId = 'tenant-b'
    assert.equal(tenantScope.effectiveTenantId, null)
    assert.equal(platformAll(), false, 'actor home tenant changed while platform scope stayed all')

    actor.tenantId = 'tenant-a'
    tenantScope.selectedTenantId = 'tenant-a'
    const selectedPlatform = capture()
    assert.equal(selectedPlatform(), true)
    actor.platformSuper = false
    assert.equal(tenantScope.effectiveTenantId, 'tenant-a')
    assert.equal(selectedPlatform(), false, 'platform capability changed while scope stayed A')

    const ordinary = capture()
    assert.equal(ordinary(), true)
    actor.userId = 'other-user'
    assert.equal(ordinary(), false, 'user changed')
    actor.userId = 'same-user'

    actor.platformSuper = true
    const scoped = capture()
    assert.equal(tenantScope.effectiveTenantId, 'tenant-a')
    tenantScope.selectedTenantId = 'tenant-b'
    assert.equal(tenantScope.effectiveTenantId, 'tenant-b')
    assert.equal(scoped(), false, 'effective tenant changed')
    tenantScope.selectedTenantId = 'tenant-a'

    const revised = capture()
    tenantScope.revision += 1
    assert.equal(revised(), false, 'scope revision changed')

    const permitted = useTenantOperationGuard('Document:Edit')()
    assert.equal(permitted(), true)
    context.permissionGranted = false
    assert.equal(permitted(), false, 'permission was revoked')
    context.permissionGranted = true

    const routed = capture()
    assert.equal(routed(), true)
    context.routeActive = false
    assert.equal(routed(), false, 'route was invalidated')
  } finally {
    globals.forEach((name, index) => {
      const descriptor = priorGlobals[index]
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else Reflect.deleteProperty(globalThis, name)
    })
  }
})
