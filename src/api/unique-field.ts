import { useSupabase } from '@/hooks/core/useSupabase'

const { supabase, responseHandle } = useSupabase()
type ExtraWhere = Record<string, string | number | boolean | null | undefined>

export async function isFieldValueTaken(params: {
  table: string
  field: string
  value: string
  excludeId?: string
  extraWhere?: ExtraWhere
}): Promise<boolean> {
  const { table, field, value, excludeId, extraWhere } = params
  let query = supabase.from(table).select('id').eq(field, value)

  // 编辑时排除当前记录。
  if (excludeId) {
    query = query.neq('id', excludeId)
  }

  // 租户及其他业务维度由调用方传入。
  if (extraWhere) {
    Object.entries(extraWhere).forEach(([key, val]) => {
      if (val !== undefined && val !== null) {
        query = query.eq(key, val)
      }
    })
  }

  // 只取一条即可判断重复；查询失败必须阻止提交。
  const { data } = await responseHandle<{ id: string }>(() => query.limit(1).maybeSingle(), {
    breakReturn: true,
    showMessage: false
  })
  if (data === null) return false
  if (typeof data?.id !== 'string') throw new Error('唯一性校验结果无效，请稍后重试')
  return true
}
