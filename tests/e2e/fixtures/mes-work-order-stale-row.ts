import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { setupGlobDirectives } from '@/directives'
import WorkOrderDetails, {
  type WorkOrderDetailDraft
} from '@mes/views/components/manufacturing/modules/work-order-details.vue'
import { captureRenderedRowAction } from './capture-rendered-row-action'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const createRows = (prefix: string): WorkOrderDetailDraft[] => [
  {
    clientId: `${prefix}-1`,
    area: 'A',
    number: `${prefix}-01`,
    lengthMm: 1000,
    pieces: 1,
    widthMm: 100,
    areaSqm: 0.1,
    areaOverridden: false,
    remark: '',
    sortOrder: 10
  },
  {
    clientId: `${prefix}-2`,
    area: 'A',
    number: `${prefix}-02`,
    lengthMm: 1000,
    pieces: 1,
    widthMm: 100,
    areaSqm: 0.1,
    areaOverridden: false,
    remark: '',
    sortOrder: 20
  }
]
const rows = ref(createRows('OLD'))
const detailsRef = ref<InstanceType<typeof WorkOrderDetails>>()
let staleRemove: (() => void) | undefined
const captured = ref(false)
const invoked = ref(0)

const app = createApp({
  render: () =>
    h('main', { class: 'art-page-view p-4' }, [
      h(
        'button',
        {
          type: 'button',
          onClick: () => {
            staleRemove = captureRenderedRowAction(detailsRef.value, 'ArtButtonTable', undefined)
            captured.value = Boolean(staleRemove)
            rows.value = createRows('NEW')
          }
        },
        '捕获旧删除并替换明细'
      ),
      h(
        'button',
        {
          type: 'button',
          onClick: () => {
            if (!staleRemove) return
            invoked.value += 1
            staleRemove()
          }
        },
        '触发旧删除'
      ),
      h('pre', { 'data-testid': 'mes-rows' }, JSON.stringify(rows.value.map((row) => row.number))),
      h('pre', { 'data-testid': 'mes-captured' }, String(captured.value)),
      h('pre', { 'data-testid': 'mes-invoked' }, String(invoked.value)),
      h(WorkOrderDetails, {
        ref: detailsRef,
        rows: rows.value,
        'onUpdate:rows': (value: WorkOrderDetailDraft[]) => (rows.value = value),
        readonly: false,
        actionPermission: 'MesWorkOrder:Edit'
      })
    ])
})
app.use(store)
app.use(language)
app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] }))
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'mes-stale-row-test',
  tenantId: 'tenant-test',
  platformSuper: true
})
useMenuStore(store).setButtonList([
  { name: 'MesWorkOrder:Edit', path: '', type: 'button', meta: { title: '编辑' } }
])
app.mount('#app')
