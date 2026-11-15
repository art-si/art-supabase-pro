type Codepages = Record<number, { dec: string[] }>

const codepages: Codepages = {}
let pendingCodepages: Promise<void> | undefined

/** Store contiguous byte indexes and their UTF-16 values without encoder tables. */
export function packRtfCodepages(
  source: Record<string, { dec?: string[] } | string>
): Uint8Array<ArrayBuffer> {
  const words: number[] = []
  for (const [id, table] of Object.entries(source)) {
    if (typeof table === 'string' || !table.dec) continue
    const tableOffset = words.length
    words.push(Number(id), 0)
    let previousIndex = -2
    let runLengthOffset = 0
    for (const [key, value] of Object.entries(table.dec)) {
      const index = Number(key)
      if (value.length !== 1) throw new Error(`Unexpected codepage mapping ${id}:${key}`)
      if (index !== previousIndex + 1) {
        words[tableOffset + 1] += 1
        runLengthOffset = words.length + 1
        words.push(index, 0)
      }
      words[runLengthOffset] += 1
      words.push(value.charCodeAt(0))
      previousIndex = index
    }
  }

  const bytes = new Uint8Array(words.length * 2)
  const data = new DataView(bytes.buffer)
  for (const [index, word] of words.entries()) {
    if (word < 0 || word > 0xffff || !Number.isInteger(word)) {
      throw new Error('RTF codepage table exceeds the 16-bit format')
    }
    data.setUint16(index * 2, word, true)
  }
  return bytes
}

export function decodeRtfCodepages(data: ArrayBuffer): Codepages {
  const view = new DataView(data)
  const decoded: Codepages = {}
  let offset = 0
  const next = () => {
    const value = view.getUint16(offset, true)
    offset += 2
    return value
  }
  while (offset < view.byteLength) {
    const id = next()
    const runCount = next()
    const dec: string[] = []
    for (let run = 0; run < runCount; run += 1) {
      const start = next()
      const length = next()
      for (let index = 0; index < length; index += 1)
        dec[start + index] = String.fromCharCode(next())
    }
    decoded[id] = { dec }
  }
  return decoded
}

/** Wait for the data before the parser runs. A failed request can be retried. */
export function loadRtfCodepages(url: string, expectedBytes: number): Promise<void> {
  pendingCodepages ??= fetch(url)
    .then((response) => {
      if (!response.ok) throw new Error(`Unable to load RTF codepages (${response.status})`)
      return response.arrayBuffer()
    })
    .then((data) => {
      if (data.byteLength !== expectedBytes) throw new Error('Invalid RTF codepage data')
      Object.assign(codepages, decodeRtfCodepages(data))
    })
    .catch((error: unknown) => {
      pendingCodepages = undefined
      throw error
    })
  return pendingCodepages
}

export default codepages
