import { getScrollBehavior } from '@/utils/ui/scroll'
import { nextTick, type Ref } from 'vue'

export interface ValidatableFormRef {
  clearValidate: () => void
  validate: () => Promise<unknown>
}

type FormRef = Ref<ValidatableFormRef | undefined>
type FormRootRef = Ref<HTMLElement | undefined>

export function clearFormRefsValidation(formRefs: readonly FormRef[]): void {
  formRefs.forEach((formRef) => formRef.value?.clearValidate())
}

export function focusFirstInvalidFormField(
  rootRef: FormRootRef,
  selector = '.el-form-item.is-error'
): void {
  const invalidItem = rootRef.value?.querySelector<HTMLElement>(selector)
  if (!invalidItem) return

  invalidItem.scrollIntoView({ behavior: getScrollBehavior(), block: 'center' })
  const field =
    invalidItem.querySelector<HTMLElement>(
      'input:not([type="hidden"]):not([disabled]):not([aria-disabled="true"]), textarea:not([disabled]):not([aria-disabled="true"])'
    ) ??
    invalidItem.querySelector<HTMLElement>(
      'button:not([disabled]):not([aria-disabled="true"]), [tabindex]:not([tabindex="-1"]):not([type="hidden"]):not([disabled]):not([aria-disabled="true"])'
    )
  field?.focus({ preventScroll: true })
}

export async function validateFormRefs(
  formRefs: readonly FormRef[],
  rootRef: FormRootRef
): Promise<boolean> {
  for (const formRef of formRefs) {
    try {
      await formRef.value?.validate()
    } catch {
      await nextTick()
      focusFirstInvalidFormField(rootRef)
      return false
    }
  }

  return true
}
