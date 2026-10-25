import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import { setupGlobDirectives } from '@/directives'
import language from '@/locales'
import { useUserStore } from '@/store/modules/user'
import Upload from '@/components/core/forms/art-upload-file/index.vue'
import ResourcePanel from '@/components/core/forms/art-resource-picker/panel.vue'
import ResultFail from '@/views/result/fail/index.vue'
import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
import { ElButton, ElLink, ElTag, ElRadioButton } from 'element-plus'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const query = new URLSearchParams(location.search)
document.documentElement.classList.toggle('dark', query.get('theme') === 'dark')
document.documentElement.dataset.theme = query.get('theme') === 'dark' ? 'dark' : 'light'
document.documentElement.dataset.boxMode =
  query.get('box') === 'shadow-mode' ? 'shadow-mode' : 'border-mode'
const app = createApp({
  render: () =>
    h('main', { class: 'p-4 grid gap-6' }, [
      ...(query.has('result') ? [h(ResultFail)] : []),
      ...['normal', 'disabled', 'readonly'].map((mode) =>
        h('section', { 'data-mode': mode }, [
          h('h2', mode),
          h(Upload, {
            modelValue: [],
            style: 'width: 180px',
            resourceTenantId: 'test-tenant',
            disabled: mode === 'disabled',
            readonly: mode === 'readonly',
            showTip: false
          })
        ])
      ),
      ...(query.has('icons')
        ? [
            h('aside', { 'data-icon-controls': '', class: 'flex flex-wrap items-center gap-4' }, [
              h(ElButton, {}, () => [
                h(ArtSvgIcon, { icon: 'ri:add-line' }),
                h('span', '新增记录')
              ]),
              h(ElButton, { size: 'small', disabled: true }, () => [
                h(ArtSvgIcon, { icon: 'ri:lock-line' }),
                h('span', '暂无权限')
              ]),
              h(ElLink, {}, () => [h(ArtSvgIcon, { icon: 'ri:file-line' }), h('span', '查看附件')]),
              h(ElTag, {}, () => [h(ArtSvgIcon, { icon: 'ri:check-line' }), h('span', '已完成')]),
              h(ElRadioButton, { value: 'all' }, () => [
                h(ArtSvgIcon, { icon: 'ri:apps-line' }),
                h('span', '全部记录')
              ])
            ]),
            h('section', { 'data-icon-panel': '', style: 'height: 500px' }, [
              h(ResourcePanel, { showAction: false, footerTarget: '#resource-footer' })
            ])
          ]
        : [])
    ])
})
app.use(store)
setupGlobDirectives(app)
app.use(language)
app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] }))
useUserStore(store).setUserInfo({
  userId: 'upload-source-test',
  tenantId: 'test-tenant',
  platformSuper: true
})
app.mount('#upload-source')
