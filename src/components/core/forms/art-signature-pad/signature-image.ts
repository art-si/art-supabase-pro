import { uploadAttachment } from '@/api/attachments'

/** Persist canvas output through the same tenant-owned attachment boundary as uploads. */
export async function persistSignatureImage(value: string, tenantId: string): Promise<string> {
  if (!value.startsWith('data:')) return value
  if (!value.startsWith('data:image/png;base64,') || value.length > 3_000_000) {
    throw new Error('签名图片无效或过大，请清除后重新签名')
  }
  const response = await fetch(value)
  const blob = await response.blob()
  const resources = await uploadAttachment(
    new File([blob], '手写签名.png', { type: 'image/png' }),
    {
      targetTenantId: tenantId,
      remark: '合同手写签名'
    }
  )
  const url = resources[0]?.url
  if (!url) throw new Error('签名保存失败，请重试')
  return url
}
