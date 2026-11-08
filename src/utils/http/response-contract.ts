/** Pure, bounded response decoding shared by browser consumers and BFF execution. */
export interface JsonResponseContract {
  mode: 'http' | 'business'
  codePointer: string
  dataPointer: string
  successCodes: readonly (string | number)[]
}

export class ResponseContractError extends Error {
  readonly kind = 'malformed'

  constructor() {
    super('服务返回格式不符合已声明的接口合同')
    this.name = 'ResponseContractError'
  }
}

function pointer(value: unknown, path: string): unknown {
  if (path === '') return value
  if (!path.startsWith('/') || path.length > 256) throw new ResponseContractError()
  let current = value
  for (const part of path.slice(1).split('/')) {
    if (/~(?![01])/.test(part)) throw new ResponseContractError()
    const key = part.replace(/~1/g, '/').replace(/~0/g, '~')
    if (Array.isArray(current)) {
      if (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= current.length)
        throw new ResponseContractError()
      current = current[Number(key)]
    } else if (current !== null && typeof current === 'object' && Object.hasOwn(current, key)) {
      current = (current as Record<string, unknown>)[key]
    } else throw new ResponseContractError()
  }
  return current
}

function validContract(contract: JsonResponseContract): boolean {
  return (
    (contract.mode === 'http' || contract.mode === 'business') &&
    typeof contract.codePointer === 'string' &&
    typeof contract.dataPointer === 'string' &&
    Array.isArray(contract.successCodes) &&
    contract.successCodes.length <= 16 &&
    contract.successCodes.every(
      (code) =>
        (typeof code === 'string' && code.length <= 80) ||
        (typeof code === 'number' && Number.isFinite(code))
    )
  )
}

/** A business-code failure is data, never a transport retry signal. */
export function decodeResponseContract(
  payload: unknown,
  contract?: JsonResponseContract
): { ok: boolean; data: unknown } {
  if (!contract) return { ok: true, data: payload }
  if (!validContract(contract)) throw new ResponseContractError()
  if (contract.mode === 'business') {
    if (!contract.successCodes.length) throw new ResponseContractError()
    const code = pointer(payload, contract.codePointer)
    if (typeof code !== 'string' && typeof code !== 'number') throw new ResponseContractError()
    if (!contract.successCodes.includes(code)) return { ok: false, data: null }
  }
  return { ok: true, data: pointer(payload, contract.dataPointer) }
}
