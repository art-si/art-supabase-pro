import { omit } from 'lodash-es'
import { useSupabase } from '@/hooks/core/useSupabase'
import { WRITE_PERMISSION_DENIED_MESSAGE } from '@/hooks/core/useSupabase'
import { createFriendlySupabaseFunctionError } from '@/utils/supabase/error'
import { invokeSupabaseFunctionWithSessionRecovery } from '@/utils/supabase/functions'

type SystemParamItem = Api.SystemManage.SystemParamItem
type WebsiteConfigItem = Api.SystemManage.WebsiteConfigItem
type WebsiteConfigParamMeta = Api.SystemManage.WebsiteConfigParamMeta

const WEBSITE_CONFIG_PARAM_KEY = 'website.config'
const { supabase, keysToSnakeDeep, responseHandle } = useSupabase()

const getWebsiteConfigParamMeta = (row: SystemParamItem): WebsiteConfigParamMeta => ({
  paramName: row.paramName,
  paramKey: row.paramKey,
  groupCode: row.groupCode,
  groupName: row.groupName,
  paramType: row.paramType,
  defaultValue: row.defaultValue ?? null,
  extendConfig: row.extendConfig ?? {},
  enabled: row.enabled,
  builtin: row.builtin,
  sort: row.sort,
  remark: row.remark ?? null
})

const parseWebsiteConfigParam = (row: SystemParamItem | null): WebsiteConfigItem | null => {
  if (!row?.paramValue) return null

  try {
    const parsed = JSON.parse(row.paramValue) as WebsiteConfigItem
    return {
      ...parsed,
      id: row.id,
      tenantId: row.tenantId,
      paramMeta: getWebsiteConfigParamMeta(row),
      createBy: row.createBy,
      createTime: row.createTime,
      updateBy: row.updateBy,
      updateTime: row.updateTime
    }
  } catch {
    return null
  }
}

export async function fetchWebsiteConfig(): Promise<{
  data: WebsiteConfigItem | null
  error: unknown | null
}> {
  const { data, error } = await responseHandle<SystemParamItem | null>(
    () =>
      supabase
        .from('sys_param')
        .select('*')
        .eq('param_key', WEBSITE_CONFIG_PARAM_KEY)
        .eq('enabled', true)
        .maybeSingle(),
    {
      showErrorMessage: false
    }
  )

  return {
    data: parseWebsiteConfigParam(data),
    error
  }
}

export async function saveWebsiteConfig(params: WebsiteConfigItem) {
  const { id, paramMeta } = params
  const payload = omit(params, [
    'id',
    'tenantId',
    'paramMeta',
    'createBy',
    'createTime',
    'updateBy',
    'updateTime'
  ])

  const paramValue = JSON.stringify(payload)

  if (!id) {
    const existing = await responseHandle<SystemParamItem | null>(
      () =>
        supabase
          .from('sys_param')
          .select('*')
          .eq('param_key', WEBSITE_CONFIG_PARAM_KEY)
          .maybeSingle(),
      {
        showErrorMessage: false
      }
    )
    if (existing.data?.id) {
      const existingId = existing.data.id
      const updatePayload = {
        ...omit(paramMeta ?? getWebsiteConfigParamMeta(existing.data), ['paramKey']),
        paramValue
      }
      return await responseHandle(
        () =>
          supabase
            .from('sys_param')
            .update(keysToSnakeDeep(updatePayload), { count: 'exact' })
            .eq('id', existingId),
        {
          showMessage: true,
          breakReturn: true,
          requireAffected: true,
          noAffectedMessage: WRITE_PERMISSION_DENIED_MESSAGE
        }
      )
    }

    if (!paramMeta) {
      throw new Error('未找到网站配置参数记录，无法保存网站配置')
    }

    return await responseHandle(
      () => supabase.from('sys_param').insert(keysToSnakeDeep({ ...paramMeta, paramValue })),
      {
        showMessage: true,
        breakReturn: true
      }
    )
  }

  return await responseHandle(
    () =>
      supabase
        .from('sys_param')
        .update(
          keysToSnakeDeep({
            ...(paramMeta ? omit(paramMeta, ['paramKey']) : {}),
            paramValue
          }),
          { count: 'exact' }
        )
        .eq('id', id),
    {
      showMessage: true,
      breakReturn: true,
      requireAffected: true,
      noAffectedMessage: WRITE_PERMISSION_DENIED_MESSAGE
    }
  )
}

export async function generateWebsiteWordmark(
  params: Api.SystemManage.WebsiteWordmarkGenerateRequest
): Promise<Api.SystemManage.WebsiteWordmarkGenerateResponse> {
  const { data, error } =
    await invokeSupabaseFunctionWithSessionRecovery<Api.SystemManage.WebsiteWordmarkGenerateResponse>(
      'ai-website-wordmark',
      { body: params }
    )

  if (error) {
    throw await createFriendlySupabaseFunctionError(
      error,
      'AI 品牌字图生成服务暂时不可用，请稍后重试'
    )
  }
  if (
    !data?.imageBase64 ||
    !data.runId ||
    !['image/png', 'image/jpeg', 'image/webp'].includes(data.mimeType)
  ) {
    throw new Error('AI 品牌字图服务返回了无效结果')
  }
  return data
}
