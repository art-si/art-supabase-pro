import { useSupabase } from '@/hooks/core/useSupabase'
import type { DataSelectFetchParams } from '@/components/core/forms/art-data-select/types'
import type {
  MaterialSelectCategory,
  MaterialSelectRecord
} from '@/components/business/art-material-select/types'
import { buildSupabasePageRange, fetchAllRangePages } from '@/utils/supabase/pagination'
import { buildOrIlikeFilter } from '@/utils/supabase/search'

const { supabase, responseHandle } = useSupabase()
const readOptions = {
  breakReturn: true,
  showErrorMessage: false,
  errorMessage: '物料主数据加载失败，请重试'
}

export interface PartMaterialOption extends MaterialSelectRecord {
  id: string
  tenantId: string
  materialCode: string
  materialName: string
  status: 'enabled' | 'disabled'
  baseUnitId: string | null
  baseUnit: PartUnitOption | null
}

export interface PartUnitOption {
  id: string
  tenantId: string
  unitCode: string
  unitName: string
  status: 'enabled' | 'disabled'
}

export async function fetchPartMaterialOptions(
  params: DataSelectFetchParams,
  tenantId?: string | null
): Promise<{ data: PartMaterialOption[]; total: number }> {
  const { from, to } = buildSupabasePageRange({ current: params.page, size: params.pageSize })
  let query = supabase
    .from('mdm_material')
    .select(
      'id,tenant_id,material_code,material_name,description,specification_model,drawing_no,brand,material_composition,material_type,material_source,special_purchase_type,category_id,status,base_unit_id,category:mdm_material_category(id,category_name),baseUnit:mdm_unit_of_measure!mdm_material_base_unit_fkey(id,tenant_id,unit_code,unit_name,status)',
      { count: 'exact' }
    )
    .eq('status', 'enabled')
    .order('material_code')
    .order('id')
    .range(from, to)
  if (tenantId) query = query.eq('tenant_id', tenantId)
  if (params.filters.categoryId) query = query.eq('category_id', String(params.filters.categoryId))
  if (params.keyword) {
    query = query.or(
      buildOrIlikeFilter(
        ['material_code', 'material_name', 'description', 'specification_model'],
        params.keyword
      )
    )
  }
  const result = await responseHandle<PartMaterialOption[]>(() => query, readOptions)
  return { data: result.data ?? [], total: result.total ?? 0 }
}

export async function fetchPartMaterialCategories(
  tenantId?: string | null
): Promise<MaterialSelectCategory[]> {
  const result = await fetchAllRangePages<MaterialSelectCategory>(({ from, to }) => {
    let query = supabase
      .from('mdm_material_category')
      .select('id,parent_id,category_code,category_name')
      .eq('status', 'enabled')
      .order('sort')
      .order('id')
      .range(from, to)
    if (tenantId) query = query.eq('tenant_id', tenantId)
    return responseHandle<MaterialSelectCategory[]>(() => query, readOptions)
  })
  if (result.error) throw result.error
  return result.data ?? []
}

export async function fetchPartUnitOptions(tenantId?: string | null): Promise<PartUnitOption[]> {
  const result = await fetchAllRangePages<PartUnitOption>(({ from, to }) => {
    let query = supabase
      .from('mdm_unit_of_measure')
      .select('id,tenant_id,unit_code,unit_name,status')
      .eq('status', 'enabled')
      .order('unit_code')
      .order('id')
      .range(from, to)
    if (tenantId) query = query.eq('tenant_id', tenantId)
    return responseHandle<PartUnitOption[]>(() => query, {
      ...readOptions,
      errorMessage: '计量单位加载失败，请重试'
    })
  })
  if (result.error) throw result.error
  return result.data ?? []
}
