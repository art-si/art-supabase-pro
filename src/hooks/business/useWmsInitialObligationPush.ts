import { ref } from 'vue'
import { uniqBy } from 'lodash-es'
import { ElMessage } from 'element-plus'
import { pushWmsInitialObligation } from '@/api/wms-initialization-accounting'
import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'

export function useWmsInitialObligationPush(options: {
  area: 'sales' | 'purchase'
  getSelection: () => Array<{ documentId: string; status: unknown; kind: unknown }>
  afterPush: () => Promise<void>
}) {
  const pushing = ref(false)
  async function push(): Promise<void> {
    if (pushing.value) return
    const rows = uniqBy(options.getSelection(), 'documentId')
    if (
      rows.length !== 1 ||
      rows[0].status !== 'approved' ||
      !String(rows[0].kind).startsWith('initial_')
    ) {
      ElMessage.warning('请在单据视图勾选一张已审核的期初单据')
      return
    }
    pushing.value = true
    try {
      await pushWmsInitialObligation(options.area, rows[0].documentId)
      ElMessage.success('期初往来已登记，重复下推不会重复记账')
      await options.afterPush()
    } catch (error) {
      ElMessage.error(getFriendlySupabaseErrorMessage(error, '期初往来下推失败，请重试'))
    } finally {
      pushing.value = false
    }
  }
  return { pushing, push }
}
