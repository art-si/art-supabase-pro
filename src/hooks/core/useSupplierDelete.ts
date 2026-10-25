import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { deleteSupplierMasterRecords } from '@/api/master-data-delete'
import { DeleteReferenceBlockedError } from '@/utils/supabase/delete-reference'
import { useAuth } from './useAuth'
import { notifyFriendlyError, useArtFeedback } from './useArtFeedback'
import { useRecordDeleteGuard } from './useRecordDeleteGuard'

interface SupplierDeleteRecord {
  id?: string
  supplierName: string
  supplierCode: string
}

/** SMIS and MDM maintain the same supplier records and deletion policy. */
export function useSupplierDelete(
  permission: 'SmisSupplier:Delete' | 'MdmPurchaseSupplier:Delete'
) {
  const { hasAuth } = useAuth()
  const { confirmDelete } = useArtFeedback()
  const { deleteGuardRef, inspectDeleteReferences } = useRecordDeleteGuard('mdm_supplier', '供应商')
  const deleteBusy = ref(false)

  const removeSuppliers = async (
    rows: SupplierDeleteRecord[],
    refreshRows: () => unknown | Promise<unknown>
  ): Promise<void> => {
    if (deleteBusy.value || !rows.length) return
    if (!hasAuth(permission) || rows.some((row) => !row.id)) {
      ElMessage.error('当前账号无权删除所选供应商，或记录已变化，请刷新后重试')
      return
    }
    const resources = rows.flatMap((row) =>
      row.id
        ? [
            {
              id: row.id,
              label: `${row.supplierName} · ${row.supplierCode}`
            }
          ]
        : []
    )
    deleteBusy.value = true
    try {
      if (await inspectDeleteReferences(resources)) return
      await confirmDelete(
        rows.length === 1
          ? `确定删除供应商“${rows[0].supplierName}”吗？`
          : `确定删除选中的 ${rows.length} 家供应商吗？`
      )
      if (!hasAuth(permission)) {
        ElMessage.error('供应商删除权限已变化，请刷新页面后重试')
        return
      }
      try {
        await deleteSupplierMasterRecords(resources.map((row) => row.id))
      } catch (error) {
        if (error instanceof DeleteReferenceBlockedError) return
        if (await inspectDeleteReferences(resources)) return
        throw error
      }
      ElMessage.success('供应商已删除')
      await refreshRows()
    } catch (error) {
      if (error !== 'cancel' && error !== 'close')
        notifyFriendlyError(error, '供应商删除失败，请检查网络后重试')
    } finally {
      deleteBusy.value = false
    }
  }
  return { deleteGuardRef, deleteBusy, removeSuppliers }
}
