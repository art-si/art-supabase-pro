import type { SupabaseOperation } from '../../types/supabase-operations'
import { OPERATIONS_PROJECT_REF } from './operations-catalog'

export function validateOperationInput(
  operation: SupabaseOperation,
  input: unknown
): Record<string, string | boolean> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('操作参数无效。')
  const parameters: Record<string, string | boolean> = {}
  for (const [key, value] of Object.entries(input)) {
    const field = operation.fields.find((item) => item.key === key)
    if (!field) throw new Error('包含不支持的参数。')
    if (field.kind === 'switch') {
      if (typeof value !== 'boolean') throw new Error(`${field.label}必须为开关值。`)
      parameters[key] = value
    } else {
      if (
        typeof value !== 'string' ||
        value.length > 8192 ||
        value.includes('\0') ||
        /[\r\n]/.test(value)
      )
        throw new Error(`${field.label}格式无效。`)
      parameters[key] = field.kind === 'secret' ? value : value.trim()
      if (!field.required && parameters[key] === '') delete parameters[key]
    }
  }
  for (const field of operation.fields) {
    if (
      field.required &&
      (typeof parameters[field.key] !== 'string' || !String(parameters[field.key]).trim())
    )
      throw new Error(`请填写${field.label}。`)
  }
  for (const key of ['TargetProjectRef', 'DistributionProjectRef']) {
    const value = parameters[key]
    if (value && (!/^[a-z0-9]{20}$/.test(String(value)) || value === OPERATIONS_PROJECT_REF))
      throw new Error('目标必须是另一个独立的 Supabase 项目。')
  }
  if (
    operation.id === 'restoreRemote' &&
    parameters.ConfirmTargetProjectRef !== parameters.TargetProjectRef
  )
    throw new Error('两次输入的目标项目 ID 不一致。')
  if (parameters.ExpectedSha256 && !/^[a-f\d]{64}$/i.test(String(parameters.ExpectedSha256)))
    throw new Error('SHA-256 必须是 64 位十六进制校验值。')
  if (operation.id === 'download') {
    if (
      ['SignedUrl', 'ArchivePath', 'PartsManifestPath'].filter((key) => parameters[key]).length !==
      1
    )
      throw new Error('下载地址、本机 ZIP 和分片清单必须且只能填写一项。')
    if (!parameters.PartsManifestPath && !parameters.ExpectedSha256)
      throw new Error('下载地址和本机 ZIP 需要填写 SHA-256 校验值。')
  }
  if (
    parameters.ExpiresInSeconds &&
    (!/^\d+$/.test(String(parameters.ExpiresInSeconds)) ||
      Number(parameters.ExpiresInSeconds) < 60 ||
      Number(parameters.ExpiresInSeconds) > 86400)
  )
    throw new Error('链接有效期应为 60 至 86400 秒。')
  if (parameters.SignedUrl) {
    let url: URL
    try {
      url = new URL(String(parameters.SignedUrl))
    } catch {
      throw new Error('请输入有效的 HTTPS 分发地址。')
    }
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    )
      throw new Error('请输入可信的 HTTPS 分发地址。')
  }
  if (parameters.Email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(parameters.Email)))
    throw new Error('请输入有效的账号邮箱。')
  if (
    parameters.PlanId &&
    !/^[a-f\d]{8}-[a-f\d]{4}-[1-5][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(
      String(parameters.PlanId)
    )
  )
    throw new Error('更新计划编号无效，请从检查结果重新准备更新。')
  if (operation.id === 'setLocalLogin' && String(parameters.Password || '').length < 8)
    throw new Error('本地登录密码至少需要 8 个字符。')
  return parameters
}
