import { useRouteOperationGuard } from '@/hooks/core/useRouteTableContext'
import { useAuth } from '@/hooks/core/useAuth'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { useUserStore } from '@/store/modules/user'

/** Capture a business operation before waiting for data that will open or print UI. */
export function useTenantOperationGuard(permission?: string): () => () => boolean {
  const captureRoute = useRouteOperationGuard()
  const tenantScope = useTenantScopeStore()
  const user = useUserStore()
  const { hasAuth } = useAuth()
  return () => {
    const isCurrentRoute = captureRoute()
    const tenantId = tenantScope.effectiveTenantId
    const revision = tenantScope.revision
    const userId = user.getUserInfo.userId
    return () =>
      isCurrentRoute() &&
      tenantScope.effectiveTenantId === tenantId &&
      tenantScope.revision === revision &&
      user.getUserInfo.userId === userId &&
      (!permission || hasAuth(permission))
  }
}
