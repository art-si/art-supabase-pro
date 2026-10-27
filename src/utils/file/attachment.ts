/** Remove one displayed attachment even when legacy rows share a resource URL. */
export function removeAttachmentRow<
  T extends { url?: string; name?: string; fileType?: string; fileSize?: string }
>(attachments: readonly T[], selected: T): T[] {
  let index = attachments.indexOf(selected)
  if (index < 0)
    index = attachments.findIndex(
      (item) =>
        item.url === selected.url &&
        item.name === selected.name &&
        item.fileType === selected.fileType &&
        item.fileSize === selected.fileSize
    )
  if (index < 0 && selected.url) index = attachments.findIndex((item) => item.url === selected.url)
  return attachments.filter((_, itemIndex) => itemIndex !== index)
}
