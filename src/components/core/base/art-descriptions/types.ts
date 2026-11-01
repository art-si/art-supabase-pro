import type { DictDisplayMode } from '@/types/component'
import type { ArtValueFormat } from '@/utils/ui'
import type { VNodeChild } from 'vue'

export interface ArtDescriptionItem<TData extends object = Record<string, unknown>> {
  key: string
  label: string
  field?: string
  // Keep static values unrestricted without unknown absorbing the callback's contextual type.
  value?: NonNullable<unknown> | null | ((data: TData) => unknown)
  span?: number
  dictCode?: string
  dictDisplay?: DictDisplayMode
  format?: ArtValueFormat
  formatter?: (value: unknown, data: TData) => string
  render?: (value: unknown, data: TData) => VNodeChild
  copyable?: boolean
  className?: string
}
