import { createApp, h, ref, type Ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import CryptoJS from 'crypto-js'
import ScreenLock from '@/components/core/layouts/art-screen-lock/index.vue'
import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
import { ElConfigProvider } from 'element-plus'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import i18n from '@/locales'
import { setupGlobDirectives } from '@/directives'
import { mittBus } from '@/utils/sys'
import '@/assets/styles/core/tailwind.css'
import '@/assets/styles/index.scss'

const params = new URLSearchParams(location.search)
document.documentElement.classList.toggle('dark', params.get('theme') === 'dark')
document.documentElement.dataset.boxMode = params.get('box') ?? 'border-mode'
const user = useUserStore(store)
user.setUserInfo({
  userId: 'screen-lock-test',
  tenantId: '11111111-1111-4111-8111-111111111111',
  nickName: '锁屏交互验收用户',
  platformSuper: false
})
user.setLockPassword(
  params.has('locked')
    ? CryptoJS.AES.encrypt('screen-test-password', import.meta.env.VITE_LOCK_ENCRYPT_KEY).toString()
    : ''
)
user.setLockStatus(params.has('locked'))
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/', component: { render: () => h('div') } }]
})
const app = createApp({
  setup() {
    const mounted = ref(true)
    const businessDialog = ref<ArtDialogExpose>()
    const businessDrawer = ref<ArtDrawerExpose>()
    const dialogDraft = ref('保留弹窗草稿')
    const drawerDraft = ref('保留抽屉草稿')
    const draftInput = (label: string, draft: Ref<string>) =>
      h('input', {
        'aria-label': label,
        value: draft.value,
        onInput: (event: Event) => {
          if (event.target instanceof HTMLInputElement) draft.value = event.target.value
        }
      })
    return () =>
      h(
        ElConfigProvider,
        { zIndex: 3000 },
        {
          default: () =>
            h('main', [
              mounted.value ? h(ScreenLock) : null,
              params.has('business-overlay')
                ? h(
                    ArtDialog,
                    { ref: businessDialog, zIndex: 9000 },
                    {
                      default: () => draftInput('业务弹窗草稿', dialogDraft)
                    }
                  )
                : null,
              params.has('business-overlay')
                ? h(
                    ArtDrawer,
                    { ref: businessDrawer, zIndex: 10000 },
                    {
                      default: () => draftInput('业务抽屉草稿', drawerDraft)
                    }
                  )
                : null,
              h('input', { 'aria-label': '背景输入', value: '背景内容' }),
              h(
                'div',
                {
                  class: 'screen-lock-fixture-controls',
                  style: {
                    position: 'fixed',
                    bottom: '8px',
                    right: '8px',
                    maxWidth: 'calc(100% - 16px)',
                    zIndex: 3000,
                    display: 'flex',
                    gap: '8px',
                    flexWrap: 'wrap'
                  }
                },
                [
                  h('button', { onClick: () => mittBus.emit('openLockScreen') }, '打开锁屏设置'),
                  h(
                    'button',
                    { onClick: () => businessDialog.value?.handleOpen({}, { title: '业务弹窗' }) },
                    '打开业务弹窗'
                  ),
                  h(
                    'button',
                    { onClick: () => businessDrawer.value?.handleOpen({}, { title: '业务抽屉' }) },
                    '打开业务抽屉'
                  ),
                  h(
                    'button',
                    {
                      onClick: () => {
                        user.setLockPassword(
                          CryptoJS.AES.encrypt(
                            'screen-test-password',
                            import.meta.env.VITE_LOCK_ENCRYPT_KEY
                          ).toString()
                        )
                        user.setLockStatus(true)
                      }
                    },
                    '进入验收锁屏'
                  ),
                  h('button', { onClick: () => (mounted.value = !mounted.value) }, '切换组件'),
                  h(
                    'button',
                    {
                      onClick: () => {
                        user.setLockStatus(false)
                        user.setLockPassword('')
                      }
                    },
                    '清理验收锁屏'
                  ),
                  h('output', { 'aria-label': '锁屏状态' }, String(user.isLock)),
                  h('output', { 'aria-label': '已清理锁屏密码' }, String(!user.lockPassword))
                ]
              )
            ])
        }
      )
  }
})
app.use(store)
app.use(i18n)
app.use(router)
setupGlobDirectives(app)
app.mount('#app')
