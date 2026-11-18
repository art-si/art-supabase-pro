import { createSharedComposable, useEventListener } from '@vueuse/core'

// Picker popups are teleported. Delegate once for the tree pickers owned by ArtForm.
export const useTreePickerKeyboard = createSharedComposable(() =>
  useEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.isComposing || !['Enter', ' '].includes(event.key)) return

    const node = event.target
    if (
      !(node instanceof HTMLElement) ||
      !node.matches('.el-tree-node[role="treeitem"]:not([aria-disabled="true"])') ||
      !node.closest('.el-select__popper.el-tree-select__popper.art-form-picker-popper') ||
      node.querySelector(':scope > .el-tree-node__content input[type="checkbox"]')
    )
      return

    // Element Plus already handles checkboxes but does not activate ordinary nodes with these keys.
    event.preventDefault()
    if (!event.repeat) node.click()
  })
)
