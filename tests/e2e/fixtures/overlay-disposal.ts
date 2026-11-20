import { createApp, h, nextTick, ref, shallowRef, unref } from 'vue'
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

type OverlayApi = ArtDialogExpose<{ id: string }> | ArtDrawerExpose<{ id: string }>
const params = new URLSearchParams(location.search)
const isDrawer = params.get('kind') === 'drawer'
const phase = params.get('phase') ?? 'open'
const sessionScenario = params.get('scenario') === 'session'
const mounted = ref(true)
const overlay = ref<OverlayApi>()
const errors = ref(0)
const resets = ref(0)
const callbacks = ref(0)
const completions = ref(0)
const retainedRecord = ref('')
const recordOverlayError = () => {
  errors.value++
}
const recordOverlayReset = () => {
  resets.value++
}
let retainedApi: OverlayApi | undefined
let rejectPending: ((error: Error) => void) | undefined
const waitForFailure = () => {
  callbacks.value++
  return new Promise<void>((_resolve, reject) => {
    rejectPending = reject
  })
}
const open = async () => {
  retainedApi = overlay.value
  await overlay.value?.handleOpen(
    { id: '待处理草稿' },
    {
      title: '公共弹层卸载验收',
      onOpen: phase === 'open' ? waitForFailure : undefined,
      onConfirm: phase === 'confirm' ? waitForFailure : undefined,
      onClose: phase === 'close' ? waitForFailure : undefined
    }
  )
  completions.value++
}
const control = (label: string, action: () => unknown) =>
  h('button', { type: 'button', onClick: action }, label)
const output = (label: string, value: number) => h('output', { 'aria-label': label }, String(value))
const firstSessionApi = shallowRef<OverlayApi>()
const secondSessionApi = shallowRef<OverlayApi>()
const sessionGate = Promise.withResolvers<void>()
const sessionState = (api?: OverlayApi) => ({
  visible: unref(api?.visible) ?? false,
  loading: unref(api?.loading) ?? false,
  confirming: unref(api?.confirmLoading) ?? false,
  id: api?.getData().id ?? '',
  dataId: unref(api?.data)?.id ?? '',
  title: unref(api?.options)?.title ?? '',
  fullscreen: unref(api?.fullscreen) ?? false,
  focus: unref(api?.focusMode) ?? false,
  scroll:
    document.querySelector<HTMLElement>(
      `${isDrawer ? '.art-drawer' : '.art-dialog'} .el-scrollbar__wrap`
    )?.scrollTop ?? 0
})
const sessionBaseline = ref<ReturnType<typeof sessionState>>()
const staleAttempts = ref<Array<{ command: string; state: ReturnType<typeof sessionState> }>>([])
const currentAttempts = ref<Array<{ command: string; state: ReturnType<typeof sessionState> }>>([])
const staleResults = ref<{ close?: boolean; confirm?: boolean; unlockedConfirm?: boolean }>({})
const currentResults = ref<{ publicConfirm?: boolean; callbackConfirm?: boolean; close?: boolean }>(
  {}
)
const staleComplete = ref(false)
const staleOpenCalls = ref(0)
const currentConfirmations = ref(0)
const currentComplete = ref(false)
const openSessionA = () =>
  overlay.value?.handleOpen(
    { id: 'A草稿' },
    {
      title: 'A会话',
      contentHeight: 240,
      onOpen: async (_data: { id: string }, api: OverlayApi) => {
        firstSessionApi.value = api
        await sessionGate.promise
        const baseline = sessionState(overlay.value)
        const commands = [
          ['setLoading', () => api.setLoading(false)],
          ['setConfirmLoading', () => api.setConfirmLoading(false)],
          ['setOptions', () => api.setOptions({ title: 'A过期标题', loading: false })],
          ['setData', () => api.setData({ id: 'A过期替换' })],
          ['updateData', () => api.updateData({ id: 'A过期合并' })],
          ['setFullscreen', () => api.setFullscreen(!baseline.fullscreen)],
          ['toggleFullscreen', () => api.toggleFullscreen()],
          ['setFocusMode', () => api.setFocusMode(!baseline.focus)],
          ['toggleFocusMode', () => api.toggleFocusMode()],
          ['scrollTo', () => api.scrollTo({ top: 0 })],
          ['handleReset', () => api.handleReset()],
          [
            'handleClose',
            async () => {
              staleResults.value.close = await api.handleClose()
            }
          ],
          [
            'handleConfirm',
            async () => {
              staleResults.value.confirm = await api.handleConfirm()
            }
          ],
          [
            'handleOpen',
            () =>
              api.handleOpen(
                { id: 'A过期重开' },
                {
                  title: 'A过期重开',
                  onOpen: () => {
                    staleOpenCalls.value++
                  }
                }
              )
          ]
        ] as const
        for (const [command, execute] of commands) {
          await execute()
          await nextTick()
          staleAttempts.value.push({ command, state: sessionState(overlay.value) })
        }
        staleComplete.value = true
      }
    }
  )
const openSessionB = async () => {
  await overlay.value?.handleOpen(
    { id: 'B初始草稿' },
    {
      title: 'B会话',
      loading: true,
      loadingText: 'B会话正在处理',
      contentHeight: 240,
      onOpen: (_data: { id: string }, api: OverlayApi) => {
        secondSessionApi.value = api
      },
      onConfirm: () => {
        currentConfirmations.value++
        return false
      }
    }
  )
  overlay.value?.updateData({ id: 'B公开更新草稿' })
  overlay.value?.setOptions({ title: 'B公开更新标题' })
  overlay.value?.setConfirmLoading(true)
  await nextTick()
  overlay.value?.scrollTo({ top: 72 })
  await nextTick()
  sessionBaseline.value = sessionState(overlay.value)
}
const exerciseCurrentApi = async () => {
  const api = secondSessionApi.value
  if (!api) return
  const commands = [
    ['setLoadingTrue', () => api.setLoading(true)],
    ['setLoadingFalse', () => api.setLoading(false)],
    ['setConfirmLoadingTrue', () => api.setConfirmLoading(true)],
    ['setConfirmLoadingFalse', () => api.setConfirmLoading(false)],
    ['setOptions', () => api.setOptions({ title: 'B回调更新标题', loading: false })],
    ['setData', () => api.setData({ id: 'B回调替换草稿' })],
    ['updateData', () => api.updateData({ id: 'B回调合并草稿' })],
    ['setFullscreen', () => api.setFullscreen(true)],
    ['toggleFullscreen', () => api.toggleFullscreen()],
    ['setFocusMode', () => api.setFocusMode(true)],
    ['toggleFocusMode', () => api.toggleFocusMode()],
    ['scrollTo', () => api.scrollTo({ top: 96 })],
    [
      'handleConfirm',
      async () => {
        currentResults.value.callbackConfirm = await api.handleConfirm()
      }
    ]
  ] as const
  for (const [command, execute] of commands) {
    await execute()
    await nextTick()
    currentAttempts.value.push({ command, state: sessionState(overlay.value) })
  }
  currentComplete.value = true
}
const app = createApp({
  render: () =>
    h('main', [
      h(
        'div',
        {
          style: {
            position: 'fixed',
            bottom: '8px',
            left: '8px',
            maxWidth: 'calc(100% - 16px)',
            zIndex: 10000,
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px'
          }
        },
        sessionScenario
          ? [
              control('打开A会话', openSessionA),
              control('公开重开B会话', openSessionB),
              control('结束A会话回调', () => sessionGate.resolve()),
              control('公开解锁B并调用过期确认', async () => {
                overlay.value?.setLoading(false)
                overlay.value?.setConfirmLoading(false)
                staleResults.value.unlockedConfirm = await firstSessionApi.value?.handleConfirm()
              }),
              control('使用B回调操作', exerciseCurrentApi),
              control('公开确认B', async () => {
                currentResults.value.publicConfirm = await overlay.value?.handleConfirm()
              }),
              control('公开重置B', () => overlay.value?.handleReset()),
              control('公开关闭B', async () => {
                currentResults.value.close = await overlay.value?.handleClose()
              }),
              h(
                'output',
                { 'data-testid': 'session-baseline', hidden: true },
                JSON.stringify(sessionBaseline.value ?? null)
              ),
              h(
                'output',
                { 'data-testid': 'stale-session-attempts', hidden: true },
                JSON.stringify(staleAttempts.value)
              ),
              h(
                'output',
                { 'data-testid': 'current-session-attempts', hidden: true },
                JSON.stringify(currentAttempts.value)
              ),
              h(
                'output',
                { 'data-testid': 'stale-session-results', hidden: true },
                JSON.stringify(staleResults.value)
              ),
              h(
                'output',
                { 'data-testid': 'current-session-results', hidden: true },
                JSON.stringify(currentResults.value)
              ),
              h(
                'output',
                { 'data-testid': 'stale-api-live', hidden: true },
                JSON.stringify(sessionState(firstSessionApi.value))
              ),
              h(
                'output',
                { 'data-testid': 'current-api-live', hidden: true },
                JSON.stringify(sessionState(secondSessionApi.value))
              ),
              h(
                'output',
                { 'data-testid': 'session-completion', hidden: true },
                JSON.stringify({
                  stale: staleComplete.value,
                  current: currentComplete.value,
                  staleOpenCalls: staleOpenCalls.value,
                  confirmations: currentConfirmations.value,
                  resets: resets.value,
                  errors: errors.value
                })
              )
            ]
          : [
              control('打开待处理草稿', open),
              control('请求确认', () => overlay.value?.handleConfirm()),
              control('请求关闭', () => overlay.value?.handleClose()),
              control('切换挂载', () => {
                mounted.value = !mounted.value
              }),
              control('结束旧请求', () => rejectPending?.(new Error('controlled pending failure'))),
              control('调用旧实例', async () => {
                await retainedApi?.handleOpen(
                  { id: '旧实例重试' },
                  {
                    onOpen: () => {
                      callbacks.value++
                    }
                  }
                )
                retainedApi?.handleReset()
                retainedRecord.value = retainedApi?.getData().id ?? ''
              }),
              control('打开新草稿', () =>
                overlay.value?.handleOpen(
                  { id: '新草稿' },
                  { title: '新草稿', onConfirm: () => false }
                )
              ),
              output('回调次数', callbacks.value),
              output('错误次数', errors.value),
              output('重置次数', resets.value),
              output('打开完成次数', completions.value),
              h('output', { 'aria-label': '旧实例数据' }, retainedRecord.value)
            ]
      ),
      mounted.value
        ? h(
            isDrawer ? ArtDrawer : ArtDialog,
            {
              ref: overlay,
              onError: recordOverlayError,
              onReset: recordOverlayReset
            },
            {
              default: ({ data }: { data: { id: string } }) => [
                h('p', data.id),
                h('input', { 'aria-label': '草稿备注', value: '保留草稿内容' }),
                ...(sessionScenario
                  ? [h('div', { style: { height: '1200px' } }, '会话滚动内容')]
                  : [])
              ]
            }
          )
        : null
    ])
})
app.use(store)
app.use(language)
app.use(
  createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { render: () => h('div') } }]
  })
)
setupGlobDirectives(app)
app.mount('#overlay-disposal-preview')
