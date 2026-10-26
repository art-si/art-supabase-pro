import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { useUserStore } from '@/store/modules/user'
import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
import ArtTable from '@/components/core/tables/art-table/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const user = useUserStore(store)
const values = ['self', 'supplier', 'legacy']
const records = values.map((ownerType, index) => ({ id: index + 1, ownerType }))
const app = createApp({
  render: () =>
    h('main', { class: 'grid min-w-0 gap-4 p-4' }, [
      h(
        'button',
        { type: 'button', onClick: () => user.clearDictionaryCache() },
        '清空展示字典缓存'
      ),
      h(
        'button',
        { type: 'button', onClick: () => user.setDictMap({ ...user.getDictMap, unrelated: [] }) },
        '更新无关展示字典'
      ),
      ...(['text', 'tag', 'badge'] as const).map((display) =>
        h(
          'section',
          { class: 'flex gap-4', 'aria-label': display },
          values.map((value) =>
            h(
              'div',
              { 'data-testid': `${display}-${value}` },
              h(ArtDictDisplay, { dictCode: 'cachedOwnerType', value, display })
            )
          )
        )
      ),
      h(
        'section',
        { 'data-testid': 'dictionary-cache-table' },
        h(ArtTable, {
          data: records,
          columns: [
            {
              prop: 'ownerType',
              label: '货主类型',
              dict: { code: 'cachedOwnerType', display: 'text' }
            }
          ],
          pagination: false
        })
      )
    ])
})
app.use(store)
app.use(language)
app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] }))
app.mount('#dictionary-display-cache')
