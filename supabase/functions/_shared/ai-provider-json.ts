function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function textFromContentPart(value: unknown): string {
  if (typeof value === 'string') return value
  if (!isRecord(value)) return ''
  if (typeof value.text === 'string') return value.text
  if (isRecord(value.text) && typeof value.text.value === 'string') return value.text.value
  if (typeof value.content === 'string') return value.content
  return ''
}

export function extractAiProviderText(message: unknown): string {
  if (!isRecord(message)) return ''

  const content = message.content
  if (typeof content === 'string') return content.trim()
  if (Array.isArray(content)) {
    const text = content.map(textFromContentPart).filter(Boolean).join('\n').trim()
    if (text) return text
  }

  return typeof message.reasoning_content === 'string' ? message.reasoning_content.trim() : ''
}

function parsedRecord(value: unknown): Record<string, unknown> | null {
  if (isRecord(value)) return value
  if (typeof value !== 'string') return null
  try {
    const parsed: unknown = JSON.parse(value)
    return isRecord(parsed) ? parsed : typeof parsed === 'string' ? parsedRecord(parsed) : null
  } catch {
    return null
  }
}

function repairJsonLikeText(value: string): string {
  return value
    .replace(/([\{,]\s*)'([^'\\]*(?:\\.[^'\\]*)*)'\s*:/g, '$1"$2":')
    .replace(/:\s*'([^'\\]*(?:\\.[^'\\]*)*)'(?=\s*[,}\]])/g, (_match, content: string) =>
      `: ${JSON.stringify(content.replace(/\\'/g, "'"))}`
    )
    .replace(/([:\[,]\s*)None(?=\s*[,}\]])/g, '$1null')
    .replace(/([:\[,]\s*)True(?=\s*[,}\]])/g, '$1true')
    .replace(/([:\[,]\s*)False(?=\s*[,}\]])/g, '$1false')
    .replace(/([\{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":')
    .replace(/,\s*([}\]])/g, '$1')
}

function parseRecord(value: string): Record<string, unknown> | null {
  return parsedRecord(value) ?? parsedRecord(repairJsonLikeText(value))
}

function parseBestJsonObject(value: string): Record<string, unknown> | null {
  let bestMatch: { length: number; value: Record<string, unknown> } | null = null
  for (let start = value.indexOf('{'); start >= 0; start = value.indexOf('{', start + 1)) {
    let depth = 0
    let inString = false
    let escaped = false

    for (let index = start; index < value.length; index += 1) {
      const character = value[index]
      if (inString) {
        if (escaped) escaped = false
        else if (character === '\\') escaped = true
        else if (character === '"') inString = false
        continue
      }

      if (character === '"') inString = true
      else if (character === '{') depth += 1
      else if (character === '}') {
        depth -= 1
        if (depth === 0) {
          const candidate = value.slice(start, index + 1)
          const parsed = parseRecord(candidate)
          if (parsed && (!bestMatch || candidate.length > bestMatch.length)) {
            bestMatch = { length: candidate.length, value: parsed }
          }
          break
        }
      }
    }
  }
  return bestMatch?.value ?? null
}

export function extractAiProviderJson(message: unknown): Record<string, unknown> | null {
  if (!isRecord(message)) return null
  if (isRecord(message.parsed)) return message.parsed
  if (isRecord(message.content)) return message.content

  const text = extractAiProviderText(message)
  if (text) {
    const normalized = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    const parsed = parseRecord(normalized) ?? parseBestJsonObject(normalized)
    if (parsed) return parsed
  }

  if (typeof message.reasoning_content === 'string' && message.reasoning_content.trim() !== text) {
    const reasoning = message.reasoning_content.trim()
    return parseRecord(reasoning) ?? parseBestJsonObject(reasoning)
  }
  return null
}
