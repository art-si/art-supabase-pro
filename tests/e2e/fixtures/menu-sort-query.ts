import { createApp, h, ref } from 'vue'
import language from '@/locales'
import { store } from '@/store'
import { saveMenuSort, saveMenuDefinition } from '@/api/system-manage'

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
      h('output', { 'data-testid': 'menu-sort-result' }, result.value),
      ...['create', 'update'].map((operation) =>
        h(
          'button',
          {
            onClick: async () => {
              try {
                await saveMenuDefinition(
                  {
                    ...(operation === 'update' ? { id: 'definition-id' } : {}),
                    name: 'DefinitionExample',
                    path: '/definition',
                    component: '/system/menu',
                    meta: { title: '定义示例' }
                  },
                  operation === 'update' ? [{ id: 'sibling-id', sort: 2 }] : [],
                  { version: 4, collectionVersion: 8 }
                )
                result.value = '定义保存成功'
              } catch {
                result.value = '定义保存失败'
              }
            }
          },
          operation === 'create' ? '新增定义' : '编辑定义'
        )
      )
    ])
})
app.use(store)
app.use(language)
app.mount('#menu-sort-preview')
