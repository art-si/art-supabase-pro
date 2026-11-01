import { createApp, defineComponent, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { setupGlobDirectives } from '@/directives'
import { initializeTheme, useTheme } from '@/hooks/core/useTheme'
import { SystemThemeEnum } from '@/enums/app-enum'
import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
import CertificateRisks from '@/views/dashboard/console/modules/dashboard-certificate-risks.vue'
import type { DashboardCertificateRisk } from '@/api/dashboard'
import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const params = new URLSearchParams(location.search)
document.documentElement.classList.toggle('dark', params.get('theme') === 'dark')
document.documentElement.dataset.boxMode = params.get('box') || 'border-mode'
const records: DashboardCertificateRisk[] = Array.from(
  { length: params.has('short') ? 2 : 16 },
  (_, index) => ({
    id: String(index + 1),
    subjectId: String(index + 1),
    subjectType: 'driver',
    subjectLabel: `验收司机${index + 1}`,
    certificateType: 'driver_license',
    expiresOn: '2026-11-15',
    responsibleName: '验收责任人',
    status: 'due_15'
  })
)

const app = createApp(
  defineComponent({
    setup() {
      const dialog = ref<ArtDialogExpose>()
      const drawer = ref<ArtDrawerExpose>()
      const selected = ref('')
      const content = () =>
        h(
          'div',
          { class: 'flex flex-col gap-3' },
          Array.from({ length: 50 }, (_, index) =>
            h(
              'button',
              {
                type: 'button',
                class: 'min-h-12 rounded bg-g-100 px-3 py-3 text-left',
                onClick: () => {
                  selected.value = `正文${index + 1}`
                }
              },
              `正文操作 ${index + 1}`
            )
          )
        )
      const showFooter = params.has('footer')
      const edgeStyle = params.has('edge') ? { '--art-scroll-viewport-inset': '0px' } : {}
      return () =>
        h('main', { class: 'min-w-0 p-4' }, [
          h('div', { class: 'mb-4 flex gap-4' }, [
            h('button', { onClick: () => void drawer.value?.handleOpen() }, '打开无底部按钮抽屉'),
            h('button', { onClick: () => void dialog.value?.handleOpen() }, '打开无底部按钮弹窗'),
            h('output', { 'aria-label': '已操作' }, selected.value)
          ]),
          h(CertificateRisks, {
            loading: false,
            error: null,
            expired: 0,
            dueSoon: records.length,
            records,
            onOpenRecord: (record: DashboardCertificateRisk) => {
              selected.value = record.subjectLabel
            }
          }),
          ...(params.has('fixed')
            ? [
                h(
                  ArtSectionCard,
                  { title: '固定导航区', class: 'mt-4 h-96', scrollbarAlways: true },
                  {
                    toolbar: () => h('p', { class: 'm-0' }, '固定筛选'),
                    default: content,
                    footer: () => h('p', { class: 'm-0', 'aria-label': '当前范围' }, '50 项')
                  }
                )
              ]
            : []),
          h(
            ArtDrawer,
            {
              ref: drawer,
              title: '无底部操作抽屉',
              size: 'lg',
              showFooter,
              scrollbarAlways: true,
              style: edgeStyle
            },
            { default: content }
          ),
          h(
            ArtDialog,
            {
              ref: dialog,
              title: '无底部操作弹窗',
              size: 'lg',
              contentHeight: 360,
              showFooter,
              scrollbarAlways: true,
              style: edgeStyle
            },
            { default: content }
          )
        ])
    }
  })
)
app.use(store)
initializeTheme()
useTheme().switchThemeStyles(
  params.get('theme') === 'dark' ? SystemThemeEnum.DARK : SystemThemeEnum.LIGHT
)
document.documentElement.dataset.boxMode = params.get('box') || 'border-mode'
app.use(language)
app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] }))
setupGlobDirectives(app)
app.mount('#scroll-viewport-inset')
