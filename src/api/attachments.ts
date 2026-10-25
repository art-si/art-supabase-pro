import { useSupabase } from '@/hooks/core/useSupabase'
import { calcFileHash, formatSize } from '@/utils/file'
import { useUserStore } from '@/store/modules/user'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { resolveTenantWriteTargetId } from '@/utils/tenant-scope-context'
import { mapWithConcurrency } from '@/utils/async'
import dayjs from 'dayjs'

const { supabase, responseHandle } = useSupabase()

export async function uploadAttachment(
  files: File | File[],
  options?: {
    bucket?: string
    targetTenantId?: string
    createBy?: string
    remark?: string
    concurrency?: number
    onProgress?: (progress: Api.DataCenter.Resources.UploadProgress) => void
  }
): Promise<Api.DataCenter.Resources.ResourceListItem[]> {
  const {
    getUserInfo: { userName, nickName, tenantId },
    isPlatformSuper
  } = useUserStore()
  const {
    bucket = 'attachments',
    targetTenantId: requestedTenantId,
    createBy = userName || nickName,
    remark = '',
    concurrency = 3,
    onProgress
  } = options || {}
  const targetTenantId = resolveTenantWriteTargetId({
    explicitTenantId: requestedTenantId,
    effectiveTenantId: useTenantScopeStore().effectiveTenantId,
    actorTenantId: tenantId,
    canWriteToOtherTenant: isPlatformSuper
  })

  // 统一成数组
  const fileList = Array.isArray(files) ? files : [files]
  let processed = 0
  let succeeded = 0
  let failed = 0

  const emitProgress = (
    phase: Api.DataCenter.Resources.UploadPhase,
    currentFileName?: string
  ): void => {
    onProgress?.({
      phase,
      processed,
      succeeded,
      failed,
      total: fileList.length,
      currentFileName
    })
  }

  emitProgress('preparing')

  // 保持调用方传入的文件顺序，同时继续处理批次中其余文件并报告每个结果。
  const outcomes = await mapWithConcurrency(fileList, concurrency, async (file) => {
    try {
      const resource = await uploadSingle(file)
      succeeded += 1
      return { resource }
    } catch (error: unknown) {
      console.error('[uploadAttachment]', file.name, error)
      failed += 1
      return { error }
    } finally {
      processed += 1
      emitProgress(
        processed === fileList.length ? (failed ? 'failed' : 'completed') : 'processing',
        file.name
      )
    }
  })

  const results: Api.DataCenter.Resources.ResourceListItem[] = []
  for (const outcome of outcomes) {
    if ('error' in outcome) throw outcome.error
    results.push(outcome.resource)
  }
  return results

  /* ---------------- 单文件原子逻辑 ---------------- */

  async function uploadSingle(file: File) {
    // 1️⃣ hash
    emitProgress('hashing', file.name)
    const hash = await calcFileHash(file)

    // 2️⃣ 查重
    emitProgress('checking', file.name)
    const { data: existed } = await responseHandle<Api.DataCenter.Resources.ResourceListItem>(
      () =>
        supabase
          .from('sys_attachment')
          .select('*')
          .eq('tenant_id', targetTenantId)
          .eq('hash', hash)
          .order('create_time', { ascending: false })
          .limit(1)
          .maybeSingle(),
      { breakReturn: true, showMessage: false }
    )

    if (existed) return existed

    // 3️⃣ 路径
    const suffix = file.name.split('.').pop() || ''
    const objectName = `${hash}.${suffix}`
    // Storage 对象按租户隔离，避免不同租户上传相同内容哈希时争用同一路径。
    const storagePath = `${targetTenantId}/${dayjs().format('YYYY/MM/DD')}`
    const fullPath = `${storagePath}/${objectName}`

    // 4️⃣ 上传。对象名由内容哈希生成，相同路径对应相同文件；允许覆盖可修复
    // “Storage 已写入、附件记录写入失败”留下的孤儿对象，使重试具备幂等性。
    emitProgress('uploading', file.name)
    await responseHandle(
      () =>
        supabase.storage.from(bucket).upload(fullPath, file, {
          upsert: true,
          contentType: file.type
        }),
      {
        breakReturn: true,
        showMessage: false
      }
    )

    // 5️⃣ url
    const { data } = await responseHandle<{ publicUrl: string }>(
      () => Promise.resolve(supabase.storage.from(bucket).getPublicUrl(fullPath)),
      {}
    )

    // 6️⃣ 写库
    emitProgress('saving', file.name)
    const insertData = {
      tenant_id: targetTenantId,
      storage_mode: 'supabase',
      origin_name: file.name,
      object_name: objectName,
      hash,
      mime_type: file.type,
      storage_path: storagePath,
      suffix,
      size_byte: file.size,
      size_info: formatSize(file.size),
      url: data?.publicUrl ?? '',
      create_by: createBy,
      update_by: createBy,
      remark
    }

    const query = supabase.from('sys_attachment').insert(insertData).select().single()

    const { data: inserted } = await responseHandle<Api.DataCenter.Resources.ResourceListItem>(
      () => query,
      {
        showMessage: false,
        breakReturn: true
      }
    )

    if (!inserted) {
      throw new Error('附件上传失败')
    }

    return inserted
  }
}
