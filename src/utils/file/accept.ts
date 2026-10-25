export function isAcceptedFileType(file: Pick<File, 'name' | 'type'>, accept: string): boolean {
  const acceptedTypes = accept
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)

  if (acceptedTypes.length === 0) return true

  const mimeType = file.type.toLowerCase()
  const fileName = file.name.toLowerCase()

  return acceptedTypes.some((acceptedType) => {
    if (acceptedType.endsWith('/*')) return mimeType.startsWith(acceptedType.slice(0, -1))
    if (acceptedType.startsWith('.')) return fileName.endsWith(acceptedType)
    return mimeType === acceptedType
  })
}
