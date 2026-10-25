import { createApp, h, resolveDirective, withDirectives } from 'vue'
import { setupHighlightDirective } from '@/directives/business/highlight'
import { setupGlobDirectives } from '@/directives'
import { copyTextToClipboard } from '@/utils/file/clipboard'
import { createPinia } from 'pinia'
import Descriptions from '@/components/core/base/art-descriptions/index.vue'
import OriginalText from '@/components/business/ocr-original-text/index.vue'
import SqlResultTable from '@/views/data-center/sql-console/modules/result-table.vue'
import SettingActions from '@/components/core/layouts/art-settings-panel/widget/setting-actions.vue'
import i18n from '@/locales'
import '@/assets/styles/core/tailwind.css'
import '@/assets/styles/index.scss'
const app = createApp({
  render: () =>
    new URLSearchParams(location.search).has('business')
      ? h('main', { class: 'p-4' }, [
          h(SettingActions),
          h('section', { class: 'h-80 mt-4' }, [
            h(SqlResultTable, { data: [{ value: 0 }], columns: [{ name: 'value' }] })
          ])
        ])
      : h('main', { class: 'p-4' }, [
          h(Descriptions, {
            data: { number: '编号-0' },
            items: [{ key: 'number', label: '编号', field: 'number', copyable: true }]
          }),
          h(OriginalText, { text: '测试识别原文' }),
          withDirectives(h('section', [h('pre', [h('code', '123 actual code\n  456 indented')])]), [
            [resolveDirective('highlight')!]
          ]),
          h(
            'button',
            {
              onClick: async () => {
                try {
                  await copyTextToClipboard('兼容复制', { legacyFallback: true })
                  document.documentElement.dataset.fallback = 'success'
                } catch {
                  document.documentElement.dataset.fallback = 'failed'
                }
              }
            },
            '兼容复制'
          )
        ])
})
setupHighlightDirective(app)
setupGlobDirectives(app)
app.use(createPinia()).use(i18n).mount('#app')
