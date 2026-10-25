const REMEMBERED_IDENTIFIER_KEY = 'art-auth-remembered-identifier'
const REMEMBER_PASSWORD_PREFERENCE_KEY = 'art-auth-remember-password'

type PasswordCredentialConstructor = new (data: {
  id: string
  password: string
  name?: string
}) => Credential

type PasswordCredentialWindow = Window & {
  PasswordCredential?: PasswordCredentialConstructor
}

const getPasswordCredentialConstructor = (): PasswordCredentialConstructor | undefined =>
  (window as PasswordCredentialWindow).PasswordCredential

export const readRememberedIdentifier = (): string => {
  try {
    return localStorage.getItem(REMEMBERED_IDENTIFIER_KEY)?.trim() ?? ''
  } catch {
    return ''
  }
}

export const readRememberPasswordPreference = (): boolean => {
  try {
    return localStorage.getItem(REMEMBER_PASSWORD_PREFERENCE_KEY) !== 'false'
  } catch {
    return true
  }
}

export const writeRememberPasswordPreference = (enabled: boolean): void => {
  try {
    localStorage.setItem(REMEMBER_PASSWORD_PREFERENCE_KEY, String(enabled))
  } catch {
    // 浏览器禁用本地存储时仍允许正常登录。
  }
}

export const writeRememberedIdentifier = (identifier: string): boolean => {
  try {
    if (identifier) {
      localStorage.setItem(REMEMBERED_IDENTIFIER_KEY, identifier.trim())
    } else {
      localStorage.removeItem(REMEMBERED_IDENTIFIER_KEY)
    }
    return true
  } catch {
    return false
  }
}

export const requestBrowserPasswordSave = async (
  identifier: string,
  password: string
): Promise<'requested' | 'unavailable' | 'failed'> => {
  const PasswordCredentialClass = getPasswordCredentialConstructor()
  if (!window.isSecureContext || !PasswordCredentialClass || !navigator.credentials?.store) {
    return 'unavailable'
  }

  try {
    const credential = new PasswordCredentialClass({
      id: identifier,
      password,
      name: identifier
    })
    await navigator.credentials.store(credential)
    return 'requested'
  } catch {
    return 'failed'
  }
}

export const readBrowserPassword = async (identifier: string): Promise<string | undefined> => {
  if (
    !window.isSecureContext ||
    !getPasswordCredentialConstructor() ||
    !navigator.credentials?.get
  ) {
    return undefined
  }

  try {
    const request: CredentialRequestOptions & { password: true } = {
      password: true,
      mediation: 'silent'
    }
    const credential = await navigator.credentials.get(request)
    if (
      credential?.type !== 'password' ||
      credential.id !== identifier ||
      !('password' in credential) ||
      typeof credential.password !== 'string'
    ) {
      return undefined
    }
    return credential.password
  } catch {
    return undefined
  }
}
