import { useSupabase } from '@/hooks/core/useSupabase'

const { supabase, responseHandle } = useSupabase()

const MIME_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'application/pdf': 'pdf'
}

const SIGNED_URL_SECONDS = 15 * 60
const PRIVATE_ATTACHMENT_PATH =
  /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(?:png|jpg|webp|pdf)$/i

export const isPrivateAttachmentPath = (value: string): boolean =>
  PRIVATE_ATTACHMENT_PATH.test(value)

interface UploadPrivateAttachmentOptions {
  bucket: string
  tenantId: string
  allowedMimeTypes: readonly string[]
  maxBytes: number
}

/** Upload an immutable private object. The returned signed URL is for the upload control only. */
export async function uploadPrivateAttachment(
  file: File,
  { bucket, tenantId, allowedMimeTypes, maxBytes }: UploadPrivateAttachmentOptions
): Promise<Api.DataCenter.Resources.ResourceListItem[]> {
  if (!allowedMimeTypes.includes(file.type) || !MIME_EXTENSIONS[file.type]) {
    throw new Error('文件格式不符合当前上传要求')
  }
  if (file.size <= 0 || file.size > maxBytes) {
    throw new Error('文件大小不符合当前上传要求')
  }
  if (!tenantId) throw new Error('请先选择业务所属租户')

  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser()
  if (authError || !user) throw new Error('登录状态无效，请重新登录后上传', { cause: authError })

  const storagePath = `${tenantId}/${user.id}/${crypto.randomUUID()}.${MIME_EXTENSIONS[file.type]}`
  await responseHandle(
    () =>
      supabase.storage.from(bucket).upload(storagePath, file, {
        contentType: file.type,
        cacheControl: '300',
        upsert: false
      }),
    { breakReturn: true, errorMessage: '私有附件上传失败，请稍后重试' }
  )

  const { data } = await responseHandle<{ signedUrl: string }>(
    () => supabase.storage.from(bucket).createSignedUrl(storagePath, SIGNED_URL_SECONDS),
    { breakReturn: true, errorMessage: '附件预览生成失败，请重新打开表单' }
  )
  if (!data?.signedUrl) throw new Error('附件预览生成失败，请重新打开表单')

  return [
    {
      originName: file.name,
      objectName: storagePath.split('/').at(-1),
      mimeType: file.type,
      storagePath,
      sizeByte: file.size,
      url: data.signedUrl
    }
  ]
}

/** Extract the immutable object path from a signed Storage URL before a business RPC write. */
export function privateAttachmentPathFromSignedUrl(value: string, bucket: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('附件地址无效，请重新上传')
  }
  const prefix = `/storage/v1/object/sign/${bucket}/`
  if (!url.pathname.startsWith(prefix) || !url.searchParams.has('token')) {
    throw new Error('附件来源无效，请重新上传私有附件')
  }
  const storagePath = decodeURIComponent(url.pathname.slice(prefix.length))
  if (!isPrivateAttachmentPath(storagePath)) {
    throw new Error('附件路径无效，请重新上传')
  }
  return storagePath
}

/** Re-sign stored paths for an authorized viewer; never persist these temporary URLs. */
export async function signPrivateAttachmentPaths(
  bucket: string,
  paths: readonly string[]
): Promise<Map<string, string>> {
  if (!paths.length) return new Map()
  const { data } = await responseHandle<Array<{ path: string; signedUrl: string }>>(
    () => supabase.storage.from(bucket).createSignedUrls([...paths], SIGNED_URL_SECONDS),
    { breakReturn: true, errorMessage: '私有附件预览暂不可用，请稍后重试' }
  )
  return new Map(
    (data ?? []).filter((item) => item.signedUrl).map((item) => [item.path, item.signedUrl])
  )
}
