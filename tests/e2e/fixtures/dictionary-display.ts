import { createApp, h, ref } from 'vue'
import { store } from '@/store'
import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const fallbackName = ref('空标签名称')
const item = (value: string, name: string, label?: string): Api.DataCenter.DictListItem => ({
  value,
  name,
  label,
  code: value,
  status: '1',
  tagType: 'success'
})
const app = createApp({
  render: () =>
    h('main', { class: 'grid gap-4 p-4 min-w-0 bg-[var(--el-bg-color)]' }, [
      h(
        'button',
        {
          type: 'button',
          onClick: () => {
            fallbackName.value = '更新字典名称'
          }
        },
        '更新字典名称'
      ),
      ...(['text', 'tag', 'badge'] as const).map((display) =>
        h('section', { class: 'grid gap-2', 'aria-label': display }, [
          h('h2', {}, display),
          ...[
            { id: 'known', value: 'known', item: item('known', '不应显示备用名', '已配置标签') },
            { id: 'blank', value: 'blank', item: item('blank', fallbackName.value, '') },
            { id: 'missing-label', value: 'missing', item: item('missing', '无标签名称') },
            { id: 'empty-name', value: 'raw', item: item('raw', '', '') },
            { id: 'zero', value: 0, item: item('0', '零值名称', '') },
            { id: 'unknown', value: 'legacy' },
            { id: 'nil', value: null },
            { id: 'override', value: 'unknown', unknownText: '历史选项' },
            { id: 'explicit-item', item: item('explicit', '指定字典名称', '') }
          ].map(({ id, ...props }) =>
            h(
              'div',
              { 'data-testid': `${display}-${id}`, class: 'min-w-0' },
              h(ArtDictDisplay, { ...props, display, emptyText: '—' })
            )
          )
        ])
      )
    ])
})
app.use(store)
app.mount('#dictionary-display')
