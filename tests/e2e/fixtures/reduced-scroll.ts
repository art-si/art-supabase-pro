import { getScrollBehavior } from '@/utils/ui/scroll'
import { focusFirstInvalidFormField } from '@/utils/form/validation'
import { ref } from 'vue'

const formRoot = ref(document.body)
document.getElementById('validate')?.addEventListener('click', () => {
  focusFirstInvalidFormField(formRoot, '#current-pane .el-form-item.is-error')
})

document.getElementById('scroll')?.addEventListener('click', () => {
  const behavior = getScrollBehavior()
  document.getElementById('target')?.scrollIntoView({ behavior })
  document.body.dataset.behavior = behavior
  document.body.dataset.immediatePosition = String(window.scrollY)
})
