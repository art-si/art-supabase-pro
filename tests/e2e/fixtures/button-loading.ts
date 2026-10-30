import { createApp, defineComponent, h, ref } from 'vue'
import { ElButton, ElIcon } from 'element-plus'
import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
import ArtIconButton from '@/components/core/widget/art-icon-button/index.vue'
import { store } from '@/store'
import { initializeTheme } from '@/hooks/core/useTheme'
import { setupGlobDirectives } from '@/directives'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const app = createApp(
  defineComponent({
    setup() {
      const busy = ref(false)
      const calls = ref(0)
      const load = () => {
        busy.value = true
        calls.value++
      }
      return () =>
        h('main', { class: 'p-6 flex flex-col items-start gap-5' }, [
          h('h1', { class: 'text-lg font-medium' }, '操作按钮状态'),
          h(ElButton, { loading: busy.value, onClick: load }, () => [
            h(ArtSvgIcon, { icon: 'ri:refresh-line' }),
            '刷新连接'
          ]),
          h(ElButton, { loading: busy.value, onClick: load }, () => [
            h(ArtSvgIcon, { icon: 'ri:edit-line' }),
            '编辑副本'
          ]),
          h(ElButton, { loading: busy.value, onClick: load }, () =>
            h('span', { class: 'art-icon-label' }, [
              h(ArtSvgIcon, { icon: 'ri:download-line' }),
              '导出数据'
            ])
          ),
          h(ElButton, { loading: busy.value, onClick: load }, () => [
            h(ElIcon, null, () => h(ArtSvgIcon, { icon: 'ri:save-3-line' })),
            '保存配置'
          ]),
          h(ElButton, { loading: busy.value, onClick: load }, () => '纯文字操作'),
          h(ArtIconButton, {
            icon: 'ri:edit-line',
            label: '刷新结构图标',
            loading: busy.value,
            onClick: load
          }),
          h('span', { role: 'status' }, `触发次数：${calls.value}`),
          h(
            ElButton,
            {
              onClick: () => {
                busy.value = false
              }
            },
            () => '重置状态'
          )
        ])
    }
  })
)
app.use(store)
initializeTheme()
setupGlobDirectives(app)
app.mount('#button-loading-preview')
