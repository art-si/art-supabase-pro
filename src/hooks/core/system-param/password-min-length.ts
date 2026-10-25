import { readonly, ref } from 'vue'
import { readSystemParamValue } from './read-system-param'
import { createSecureTemporaryPassword } from '@/utils/temporary-password'

const PASSWORD_MIN_LENGTH_KEY = 'security.password.min_length'
const PASSWORD_REQUIRE_COMPLEX_KEY = 'security.password.require_complex'
const DEFAULT_PASSWORD_MIN_LENGTH = 6
const DEFAULT_PASSWORD_REQUIRE_COMPLEX = false

const passwordMinLength = ref(DEFAULT_PASSWORD_MIN_LENGTH)
const passwordRequireComplex = ref(DEFAULT_PASSWORD_REQUIRE_COMPLEX)

const parsePositiveInteger = (value: string): number | undefined => {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return undefined
  }
  return parsed
}

export const loadPasswordMinLength = async (): Promise<number> => {
  passwordMinLength.value = await readSystemParamValue({
    key: PASSWORD_MIN_LENGTH_KEY,
    fallback: DEFAULT_PASSWORD_MIN_LENGTH,
    parse: (value) => parsePositiveInteger(value)
  })
  return passwordMinLength.value
}

const parseBoolean = (value: string): boolean | undefined => {
  const normalizedValue = value.trim().toLowerCase()
  if (normalizedValue === 'true' || normalizedValue === '1') return true
  if (normalizedValue === 'false' || normalizedValue === '0') return false
  return undefined
}

export const loadPasswordRequireComplex = async (): Promise<boolean> => {
  passwordRequireComplex.value = await readSystemParamValue({
    key: PASSWORD_REQUIRE_COMPLEX_KEY,
    fallback: DEFAULT_PASSWORD_REQUIRE_COMPLEX,
    parse: (value) => parseBoolean(value)
  })
  return passwordRequireComplex.value
}

export const loadPasswordPolicy = async (): Promise<void> => {
  await Promise.all([loadPasswordMinLength(), loadPasswordRequireComplex()])
}

export const getPasswordMinLengthMessage = (
  translate?: (key: string) => string,
  fallback = '密码长度不能少于 {min} 位'
): string => {
  const template = translate?.('register.rule.passwordLength') || fallback
  return template.includes('{min}')
    ? template.replace('{min}', String(passwordMinLength.value))
    : template.replace(/\d+/, String(passwordMinLength.value))
}

export const getPasswordComplexityMessage = (
  translate?: (key: string) => string,
  fallback = '密码必须包含大写字母、小写字母、数字和特殊字符'
): string => translate?.('register.rule.passwordComplexity') || fallback

export const validatePasswordComplexity = (value: string): boolean => {
  if (!passwordRequireComplex.value) return true

  return (
    /[A-Z]/.test(value) &&
    /[a-z]/.test(value) &&
    /\d/.test(value) &&
    /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(value)
  )
}

export const createTemporaryPassword = (): string => {
  return createSecureTemporaryPassword(passwordMinLength.value, passwordRequireComplex.value)
}

export const usePasswordMinLengthParam = () => ({
  passwordMinLength: readonly(passwordMinLength),
  passwordRequireComplex: readonly(passwordRequireComplex),
  loadPasswordMinLength,
  loadPasswordRequireComplex,
  loadPasswordPolicy,
  getPasswordMinLengthMessage,
  getPasswordComplexityMessage,
  validatePasswordComplexity,
  createTemporaryPassword
})
