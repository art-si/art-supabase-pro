import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { setupGlobDirectives } from '@/directives'
import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const dialog = ref<ArtDialogExpose>()
const drawer = ref<ArtDrawerExpose>()
const snapshotDialog = ref<ArtDialogExpose<{ details: { amount: number }; callback: () => void }>>()
const sourceRecord = { details: { amount: 10 }, callback: () => undefined }
const attributesChanged = ref(false)
const nativeAllowed = ref(false)
const projectAllowed = ref(false)
const nativeCalls = ref(0)
const projectCalls = ref(0)
const callbackContract = new URLSearchParams(location.search).has('callback-contract')
const callbackCounts = ref({ open: 0, confirm: 0, close: 0, reset: 0 })
const callbackApiValid = ref(true)
type OverlayApi = ArtDialogExpose | ArtDrawerExpose
const recordCallback = (phase: keyof typeof callbackCounts.value, api: OverlayApi) => {
  callbackCounts.value[phase]++
  callbackApiValid.value &&= typeof api.handleOpen === 'function' && api.getData() !== undefined
}
const callbackProps = callbackContract
  ? {
      onOpen: (_data: unknown, api: OverlayApi) => recordCallback('open', api),
      onConfirm: (_data: unknown, api: OverlayApi) => {
        recordCallback('confirm', api)
        return false
      },
      onClose: (_data: unknown, api: OverlayApi) => {
        recordCallback('close', api)
        return projectAllowed.value
      },
      onReset: (api: OverlayApi) => recordCallback('reset', api)
    }
  : {}
const nativeScrollbar = new URLSearchParams(location.search).has('native-scrollbar')
const modal = !new URLSearchParams(location.search).has('no-modal')
const preserveContent = new URLSearchParams(location.search).has('preserve-content')
const nativeStyles = {
  modalClass: 'test-native-mask',
  headerClass: 'test-native-header',
  bodyClass: 'test-native-body',
  footerClass: 'test-native-footer',
  zIndex: 4321,
  headerAriaLevel: '3'
}
const closeEntriesEnabled = ref(!new URLSearchParams(location.search).has('locked'))
const nativeBeforeClose = (done: () => void) => {
  nativeCalls.value += 1
  if (nativeAllowed.value) done()
}
const onClose = () => {
  projectCalls.value += 1
  return projectAllowed.value
}
const app = createApp({
  render: () =>
    h('main', { class: 'p-4' }, [
      h(
        'button',
        {
          onClick: () => snapshotDialog.value?.handleOpen(sourceRecord, { title: '快照隔离检查' })
        },
        '打开快照检查'
      ),
      h(
        ArtDialog,
        { ref: snapshotDialog },
        {
          default: ({ data }: { data: typeof sourceRecord }) => [
            h('output', { 'data-testid': 'snapshot-amount' }, String(data.details.amount)),
            h(
              'button',
              {
                onClick: () => {
                  data.details.amount = 20
                }
              },
              '修改嵌套金额'
            ),
            h('button', { onClick: () => snapshotDialog.value?.handleReset() }, '恢复打开时数据'),
            h('output', { 'data-testid': 'source-amount' }, String(sourceRecord.details.amount))
          ]
        }
      ),
      h(
        'button',
        {
          onClick: () =>
            dialog.value?.handleOpen(
              {},
              { title: '关闭检查弹窗', ...(callbackContract ? {} : { onClose }) }
            )
        },
        '打开弹窗'
      ),
      h(
        'button',
        {
          onClick: () =>
            drawer.value?.handleOpen(
              {},
              { title: '关闭检查抽屉', ...(callbackContract ? {} : { onClose }) }
            )
        },
        '打开抽屉'
      ),
      h(
        'button',
        {
          onClick: () => {
            nativeAllowed.value = true
          }
        },
        '允许原生关闭'
      ),
      h(
        'button',
        {
          onClick: () => {
            projectAllowed.value = true
          }
        },
        '允许业务关闭'
      ),
      h(
        'output',
        { 'data-testid': 'close-counts' },
        JSON.stringify({ native: nativeCalls.value, project: projectCalls.value })
      ),
      h('output', { 'data-testid': 'callback-counts' }, JSON.stringify(callbackCounts.value)),
      h('output', { 'data-testid': 'callback-api-valid' }, String(callbackApiValid.value)),
      h(
        'button',
        {
          onClick: () => {
            closeEntriesEnabled.value = true
          }
        },
        '允许关闭入口'
      ),
      h(
        ArtDialog,
        {
          ref: dialog,
          ...callbackProps,
          ...nativeStyles,
          class: attributesChanged.value
            ? 'updated-overlay-attributes'
            : 'initial-overlay-attributes',
          'data-attribute-state': attributesChanged.value ? 'updated' : 'initial',
          destroyOnClose: !preserveContent,
          appendToBody: !preserveContent,
          draggable: !preserveContent,
          center: !preserveContent,
          alignCenter: !preserveContent,
          nativeScrollbar,
          modal,
          beforeClose: nativeBeforeClose,
          closeOnClickModal: closeEntriesEnabled.value,
          closeOnPressEscape: closeEntriesEnabled.value,
          showClose: closeEntriesEnabled.value,
          lockScroll: true
        },
        {
          default: () => [
            h('p', '测试草稿保持完整'),
            ...(callbackContract
              ? [h('button', { onClick: () => dialog.value?.handleReset() }, '重置回调检查')]
              : []),
            h(
              'button',
              {
                type: 'button',
                onClick: () => {
                  attributesChanged.value = true
                }
              },
              '更新弹层属性'
            )
          ]
        }
      ),
      h(
        ArtDrawer,
        {
          ref: drawer,
          ...callbackProps,
          ...nativeStyles,
          class: attributesChanged.value
            ? 'updated-overlay-attributes'
            : 'initial-overlay-attributes',
          'data-attribute-state': attributesChanged.value ? 'updated' : 'initial',
          withHeader: !new URLSearchParams(location.search).has('no-header'),
          resizable: !preserveContent,
          destroyOnClose: !preserveContent,
          appendToBody: !preserveContent,
          nativeScrollbar,
          modal,
          beforeClose: nativeBeforeClose,
          closeOnClickModal: closeEntriesEnabled.value,
          closeOnPressEscape: closeEntriesEnabled.value,
          showClose: closeEntriesEnabled.value,
          lockScroll: true
        },
        {
          default: () => [
            h('p', '测试草稿保持完整'),
            ...(callbackContract
              ? [h('button', { onClick: () => drawer.value?.handleReset() }, '重置回调检查')]
              : []),
            h(
              'button',
              {
                type: 'button',
                onClick: () => {
                  attributesChanged.value = true
                }
              },
              '更新弹层属性'
            )
          ]
        }
      )
    ])
})
app.use(store)
app.use(language)
app.use(
  createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }]
  })
)
setupGlobDirectives(app)
app.mount('#overlay-close-preview')
