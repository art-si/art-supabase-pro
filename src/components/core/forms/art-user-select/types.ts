export interface ArtUserSelectOption {
  value: string
  label: string
  avatar?: string | null
  userName?: string | null
  nickName?: string | null
  userEmail?: string | null
  departmentName?: string | null
  secondaryText?: string | null
  disabled?: boolean
}

export type ArtUserSelectValue = string | string[] | undefined
