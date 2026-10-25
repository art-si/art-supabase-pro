import type { InjectionKey, Ref } from 'vue'

export interface ArtFormFocusContext {
  focusMode: Readonly<Ref<boolean>>
  registerForm: () => () => void
}

export const artFormFocusKey: InjectionKey<ArtFormFocusContext> = Symbol('artFormFocus')
