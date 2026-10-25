import { readFileSync } from 'node:fs'

export interface PayableTypeConfiguration {
  id: string
  name: string
  code: string
  targetId: string
  targetName: string
}

export const payableTypeConfigurationPath = '.artifacts/payable-live-type-config.json'

const isTypeConfiguration = (value: unknown): value is PayableTypeConfiguration =>
  !!value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  'id' in value &&
  typeof value.id === 'string' &&
  'name' in value &&
  typeof value.name === 'string' &&
  'code' in value &&
  typeof value.code === 'string' &&
  'targetId' in value &&
  typeof value.targetId === 'string' &&
  'targetName' in value &&
  typeof value.targetName === 'string'

export function readPayableTypeConfigurations(): PayableTypeConfiguration[] {
  const value: unknown = JSON.parse(readFileSync(payableTypeConfigurationPath, 'utf8'))
  if (!Array.isArray(value) || value.length < 2 || !value.every(isTypeConfiguration))
    throw new Error('验收类型清单不完整，请先完成 MDM 两条类型的真实验收')
  return value.slice(-2)
}
