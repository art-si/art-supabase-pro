import { createApp, h } from 'vue'
import { ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { store } from '@/store'
import language from '@/locales'
import { useUserStore } from '@/store/modules/user'
import { useSettingStore } from '@/store/modules/setting'
import { initializeTheme } from '@/hooks/core/useTheme'
import ArtTable from '@/components/core/tables/art-table/index.vue'
import type { ColumnOption } from '@/types'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

interface Row {
  id: number
  name: string
}
const columns: ColumnOption<Row>[] = [
  { prop: 'name', label: '长度', required: true, headerTooltip: '长度必须大于 0 mm', minWidth: 220 }
]
const rows: Row[] = Array.from({ length: 30 }, (_, id) => ({ id, name: `测试数据 ${id + 1}` }))
const app = createApp({
  setup: () => () =>
    h(ElConfigProvider, { locale: zhCn }, () =>
      h('main', { class: 'space-y-6 p-4' }, [
        h('section', { 'data-testid': 'normal' }, [
          h(ArtTable, { data: rows.slice(0, 1), columns, pagination: false, rowKey: 'id' })
        ]),
        h('section', { 'data-testid': 'grouped' }, [
          h(ArtTable, {
            data: rows.slice(0, 1),
            columns: [{ label: '尺寸分组', headerTooltip: '统一按毫米录入', children: columns }],
            pagination: false,
            rowKey: 'id'
          })
        ]),
        h('section', { 'data-testid': 'virtual' }, [
          h(ArtTable, {
            data: rows,
            columns,
            pagination: false,
            rowKey: 'id',
            height: 260,
            virtualScroll: { enabled: true, threshold: 1 }
          })
        ])
      ])
    )
})
app.use(store)
initializeTheme()
document.documentElement.dataset.boxMode = useSettingStore(store).boxBorderMode
  ? 'border-mode'
  : 'shadow-mode'
useUserStore(store).setUserInfo({ userId: 'header-help', platformSuper: true } as Api.Auth.UserInfo)
app.use(language)
app.mount('#app')
