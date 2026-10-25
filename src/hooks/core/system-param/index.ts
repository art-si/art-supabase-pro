import { usePasswordMinLengthParam } from './password-min-length'

export function useSystemParam() {
  return {
    ...usePasswordMinLengthParam()
  }
}
