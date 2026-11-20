import type { InjectionKey, Ref } from 'vue'
import type { ArtOverlayRequestScope } from '@/hooks/core/useArtOverlay'

export interface ArtFormValidationFocusCapture {
  isCurrent: () => boolean
  markHandled: () => void
}

export interface ArtFormFocusContext {
  focusMode: Readonly<Ref<boolean>>
  registerForm: () => () => void
  captureValidationFocus?: () => ArtFormValidationFocusCapture
}

export const artFormFocusKey: InjectionKey<ArtFormFocusContext> = Symbol('artFormFocus')

/** Keep completed form positioning within its own overlay confirmation. */
export function createArtFormValidationFocusScope(scope: ArtOverlayRequestScope) {
  let confirmationBatch = 0
  let handled: { version: number; batch: number } | undefined
  const isCurrent = (version: number, batch: number): boolean =>
    scope.visible.value && scope.version.value === version && confirmationBatch === batch

  return {
    beginConfirmation: (): void => {
      confirmationBatch++
      handled = undefined
    },
    captureValidationFocus: (): ArtFormValidationFocusCapture => {
      const version = scope.version.value
      const batch = confirmationBatch
      const visible = scope.visible.value
      const isCurrentCapture = () => visible && isCurrent(version, batch)
      return {
        isCurrent: isCurrentCapture,
        markHandled: () => {
          if (isCurrentCapture()) handled = { version, batch }
        }
      }
    },
    hasHandledValidationFocus: (): boolean =>
      handled !== undefined && isCurrent(handled.version, handled.batch)
  }
}
