const PRIVATE_ATTACHMENT_PATH =
  /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(?:png|jpg|webp|pdf)$/i

export const isPrivateAttachmentPath = (value: string): boolean =>
  PRIVATE_ATTACHMENT_PATH.test(value)

/** Parse only signed Storage object URLs. The database verifies tenant, owner and existence. */
export function privateAttachmentPathFromSignedUrl(
  value: string,
  bucket: string,
  projectUrl: string
): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('附件地址无效，请重新上传')
  }
  if (url.origin !== new URL(projectUrl).origin) {
    throw new Error('附件来源无效，请重新上传私有附件')
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
