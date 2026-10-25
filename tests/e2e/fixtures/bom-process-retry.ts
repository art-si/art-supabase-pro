import { createApp, h, ref, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { setupGlobDirectives } from '@/directives'
import BomDialog from '../../../modules/art-supabase-mdm/src/views/engineering/bom-maintenance/modules/bom-dialog.vue'
import BomDetailDialog from '../../../modules/art-supabase-mdm/src/views/engineering/bom-maintenance/modules/bom-detail-dialog.vue'
import CatalogDetailDrawer from '../../../modules/art-supabase-mdm/src/views/components/catalog/modules/catalog-detail-drawer.vue'
import type { BomRecord, MdmCatalogRecord } from '../../../modules/art-supabase-mdm/src/api'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const tenantId = '11111111-1111-4111-8111-111111111111'
const dialog = ref<InstanceType<typeof BomDialog>>()
const detail = ref<InstanceType<typeof BomDetailDialog>>()
const catalog = ref<InstanceType<typeof CatalogDetailDrawer>>()
const catalogRecord: MdmCatalogRecord = {
  id: 'catalog-test',
  code: 'CAT-001',
  name: '测试主数据目录',
  status: 'active',
  isActive: true,
  subtitle: '日期和属性显示验收',
  sourceType: 'test',
  sourceLabel: '测试类型',
  sourceApp: 'platform',
  qualityScore: 100,
  qualityIssues: [],
  createTime: '2026-10-08T00:30:59Z',
  updateTime: 'invalid',
  attributes: [
    { label: '测试数量', value: 0 },
    { label: '测试开关', value: false },
    { label: '测试说明', value: '较长业务说明用于检查手机宽度下能否完整换行显示。' }
  ]
}
const successes = ref(0)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: {} }]
})
const row: BomRecord = {
  id: 'bom-a',
  tenantId,
  materialId: 'material-a',
  bomCode: 'BOM-TEST',
  version: 'V1',
  purpose: 'production',
  status: 'design',
  baseQuantity: 1,
  baseUnitId: 'unit-a',
  sort: 0,
  processRouteId: 'route-a',
  items: [],
  description: '填写保留'
}
const app = createApp({
  render: () =>
    h('main', [
      h(
        'button',
        { type: 'button', onClick: () => void catalog.value?.handleOpen(catalogRecord) },
        '打开目录验收'
      ),
      h(CatalogDetailDrawer, { ref: catalog }),
      h(
        'button',
        {
          type: 'button',
          onClick: () =>
            void detail.value?.handleOpen({
              ...row,
              items: [
                {
                  id: 'display-item',
                  tenantId,
                  bomId: row.id,
                  componentMaterialId: 'component',
                  sequenceNo: 1,
                  quantity: 0,
                  unitId: 'unit-a',
                  scrapRate: 0,
                  mrpEnabled: false,
                  issueMethod: '',
                  backflushMethod: '',
                  projectText: '  项目文本  ',
                  operationName: '  工序名称  ',
                  positionNo: '   ',
                  remark: null,
                  effectiveFrom: '2026-10-08T00:30:59Z',
                  effectiveTo: 'invalid'
                }
              ]
            })
        },
        '打开 BOM 展示验收'
      ),
      h(BomDetailDialog, { ref: detail }),
      h(
        'button',
        {
          onClick: async () => {
            useUserStore(store).setUserInfo({ userId: 'test-user', tenantId, platformSuper: true })
            await nextTick()
            void dialog.value?.handleOpen({
              row,
              tenantId,
              tenantOptions: [],
              units: [],
              groups: []
            })
          }
        },
        '打开 BOM'
      ),
      h(BomDialog, { ref: dialog, onSuccess: () => successes.value++ }),
      h(
        'button',
        {
          onClick: () =>
            dialog.value?.handleOpen({
              row: {
                ...row,
                id: 'bom-b',
                tenantId: '22222222-2222-4222-8222-222222222222',
                materialId: 'material-b',
                processRouteId: 'route-b',
                bomCode: 'BOM-OTHER',
                version: 'V2'
              },
              tenantId: '22222222-2222-4222-8222-222222222222',
              tenantOptions: [],
              units: [],
              groups: []
            })
        },
        '打开另一租户 BOM'
      ),
      h('button', { onClick: () => router.push('/away') }, '离开 BOM 页面'),
      h('output', { 'data-testid': 'success-count' }, String(successes.value))
    ])
})
app.use(store)
app.use(router)
app.use(language)
setupGlobDirectives(app)
app.mount('#bom-preview')
