import { createApp, h, reactive, ref, watch } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { useUserStore } from '@/store/modules/user'
import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
import { replaceReactiveModel } from '@/utils/form/model'
import { setupGlobDirectives } from '@/directives'
import ArtForm from '@/components/core/forms/art-form/index.vue'
import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const app = createApp({
  setup() {
    const user = useUserStore()
    user.setDictMap({
      watchedDictionary: [{ name: '初始名称', code: 'initial', value: 'initial', status: '1' }],
      commonBoolean: [{ name: '初始肯定', code: 'yes', value: 'true', status: '1' }]
    })
    const options = useDictionaryOptions('watchedDictionary')
    const booleans = useDictionaryOptions(
      'commonBoolean',
      (value) => value === 'true' || value === '1'
    )
    const stableArray = options
    const originalOption = options[0]
    const rebuilds = ref(0)
    const model = reactive({ value: 'initial', enabled: true })
    watch(
      options,
      () => {
        rebuilds.value++
      },
      { deep: true }
    )
    return () =>
      h(
        'main',
        { class: 'p-4' },
        h(
          ArtSectionCard,
          {
            title: '公共字典响应验证',
            subtitle: '无关缓存更新、选项替换与缓存重载',
            showScrollbar: false
          },
          {
            default: () => [
              h(ArtForm, {
                modelValue: model,
                'onUpdate:modelValue': (value: typeof model) => replaceReactiveModel(model, value),
                items: [
                  { key: 'value', label: '字典选项', type: 'select', options },
                  { key: 'enabled', label: '布尔选项', type: 'segment', options: booleans }
                ],
                showReset: false,
                showSubmit: false,
                span: 24
              }),
              h('div', { class: 'flex flex-wrap gap-3' }, [
                h(
                  'button',
                  {
                    type: 'button',
                    onClick: () =>
                      user.setDictMap({
                        ...user.getDictMap,
                        unrelatedDictionary: [
                          { name: '无关项', code: 'other', value: 'other', status: '1' }
                        ]
                      })
                  },
                  '更新无关字典'
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    onClick: () =>
                      user.setDictMap({
                        ...user.getDictMap,
                        watchedDictionary: [
                          { name: '更新名称', code: 'updated', value: 'updated', status: '1' }
                        ]
                      })
                  },
                  '更新当前字典'
                ),
                h(
                  'button',
                  { type: 'button', onClick: () => user.clearDictionaryCache() },
                  '清空字典缓存'
                )
              ]),
              h('output', { 'aria-label': '重建次数' }, String(rebuilds.value)),
              h('output', { 'aria-label': '数组身份稳定' }, String(options === stableArray)),
              h('output', { 'aria-label': '选项身份稳定' }, String(options[0] === originalOption)),
              h('output', { 'aria-label': '选项数量' }, String(options.length)),
              h(
                'output',
                { 'aria-label': '当前选项名称' },
                options.map((item) => item.label).join('、')
              ),
              h(
                'output',
                { 'aria-label': '布尔选项值' },
                JSON.stringify(booleans.map((item) => item.value))
              )
            ]
          }
        )
      )
  }
})
app.use(store)
app.use(language)
setupGlobDirectives(app)
app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] }))
useUserStore(store).setUserInfo({
  userId: 'dictionary-reactivity-test',
  tenantId: 'test-tenant',
  platformSuper: false
})
app.mount('#dictionary-options-reactivity')
