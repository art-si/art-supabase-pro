import { toValue, type MaybeRefOrGetter } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@/hooks/core/useAuth'
import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
import { navigateToApplication } from '@/utils/application-navigation'
import { getPayableSourceDestination } from '@/utils/finance/payable-source'
import { currentApplication } from '@/config/application'

interface PayableSourceLink {
  available: (kind: unknown, id: unknown) => boolean
  hint: (kind: unknown, id: unknown) => string
  open: (kind: unknown, id: unknown) => Promise<void>
}

export function usePayableSourceLink(
  close: () => Promise<unknown>,
  editable: MaybeRefOrGetter<boolean>
): PayableSourceLink {
  const router = useRouter()
  const { hasAuth } = useAuth()
  function available(kind: unknown, id: unknown): boolean {
    const target = getPayableSourceDestination(kind, id)
    return Boolean(target && !toValue(editable) && hasAuth(target.permission))
  }
  function hint(kind: unknown, id: unknown): string {
    const target = getPayableSourceDestination(kind, id)
    if (!target) return '来源没有可联查的标识'
    if (toValue(editable)) return '请先关闭编辑后联查来源'
    return hasAuth(target.permission) ? '查看来源单据详情' : '暂无来源单据查看权限'
  }
  async function open(kind: unknown, id: unknown): Promise<void> {
    const target = getPayableSourceDestination(kind, id)
    if (!target || !available(kind, id)) return
    try {
      await close()
      if (target.application === currentApplication.code)
        await router.push({ path: target.path, query: target.query })
      else await navigateToApplication(target.application, target.path, target.query, router)
    } catch (cause) {
      notifyFriendlyError(cause, '来源单据暂未打开，请重新打开详情后重试')
    }
  }
  return { available, hint, open }
}
