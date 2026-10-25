import { useSupabase } from '@/hooks/core/useSupabase'
import { fetchAllRangePages } from '@/utils/supabase/pagination'
import type { MaterialSelectCategory } from '@/components/business/art-material-select/types'

const { supabase, responseHandle } = useSupabase()

export async function fetchWmsMaterialCategories(
  tenantId: string
): Promise<MaterialSelectCategory[]> {
  const result = await fetchAllRangePages<MaterialSelectCategory>(({ from, to }) =>
    responseHandle<MaterialSelectCategory[]>(
      () =>
        supabase
          .from('mdm_material_category')
          .select('id,parent_id,category_code,category_name')
          .eq('tenant_id', tenantId)
          .eq('status', 'enabled')
          .order('sort')
          .order('category_name')
          .range(from, to),
      {
        breakReturn: true,
        showErrorMessage: false,
        errorMessage: '物料分类加载失败，请重试'
      }
    )
  )
  if (result.error || !result.data) {
    throw new Error('物料分类加载失败，请重试', { cause: result.error })
  }
  return result.data
}
