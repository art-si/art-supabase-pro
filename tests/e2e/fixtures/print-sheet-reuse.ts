import { createApp, h, ref } from 'vue'
import { usePrintSheet } from '@/hooks/core/usePrintSheet'
const Sheet = {
  setup() {
    const count = ref(0),
      error = ref('')
    const { print } = usePrintSheet('test-print-sheet', () => {
      count.value++
    })
    return () =>
      h('section', [
        h(
          'button',
          {
            onClick: async () => {
              try {
                await print()
              } catch {
                error.value = '打印失败'
              }
            }
          },
          '打印'
        ),
        h('output', String(count.value)),
        h('p', error.value)
      ])
  }
}
createApp({
  setup() {
    const mounted = ref(true)
    return () =>
      h('main', [
        h(
          'button',
          {
            onClick: () => {
              mounted.value = !mounted.value
            }
          },
          '切换组件'
        ),
        mounted.value ? h(Sheet) : null
      ])
  }
}).mount('#app')
