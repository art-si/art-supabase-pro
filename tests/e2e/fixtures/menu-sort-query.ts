import { createApp, h, ref } from 'vue'
import language from '@/locales'
import { store } from '@/store'
import { saveMenuSort } from '@/api/system-manage'

const result = ref('未保存')
const app = createApp({
  render: () =>
    h('main', [
      h(
        'button',
        {
          onClick: async () => {
            try {
              await saveMenuSort(
                Array.from({ length: 7 }, (_, sort) => ({ id: `menu-${sort}`, sort }))
              )
              result.value = '保存成功'
            } catch {
              result.value = '保存失败'
            }
          }
        },
        '保存排序'
      ),
      h('output', { 'data-testid': 'menu-sort-result' }, result.value)
    ])
})
app.use(store)
app.use(language)
app.mount('#menu-sort-preview')
