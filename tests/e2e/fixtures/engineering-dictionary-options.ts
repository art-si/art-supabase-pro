import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { setupGlobDirectives } from '@/directives'
import EquipmentPage from '@mdm/views/engineering/production-equipment/index.vue'
import EquipmentDialog from '@mdm/views/engineering/production-equipment/modules/equipment-dialog.vue'
import EsopPage from '@mdm/views/engineering/esop/index.vue'
import DocumentDialog from '@mdm/views/engineering/esop/modules/document-dialog.vue'
import CategoryDialog from '@mdm/views/engineering/esop/modules/category-dialog.vue'
import GroupDialog from '@mdm/views/components/operational-master/modules/group-dialog.vue'
import BomGroupDialog from '@mdm/views/engineering/bom-maintenance/modules/bom-group-dialog.vue'
import BomPage from '@mdm/views/engineering/bom-maintenance/index.vue'
import BomDialog from '@mdm/views/engineering/bom-maintenance/modules/bom-dialog.vue'
import CatalogPage from '@mdm/views/components/catalog/index.vue'
import ActivityFormulaDialog from '@mdm/views/components/operational-master/modules/activity-formula-dialog.vue'
import { resolveMasterConfig } from '@mdm/views/components/operational-master/modules/master-config'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const mode = new URLSearchParams(location.search).get('mode')
const equipment = ref<InstanceType<typeof EquipmentDialog>>()
const documentDialog = ref<InstanceType<typeof DocumentDialog>>()
const category = ref<InstanceType<typeof CategoryDialog>>()
const group = ref<InstanceType<typeof GroupDialog>>()
const bomGroup = ref<InstanceType<typeof BomGroupDialog>>()
const bom = ref<InstanceType<typeof BomDialog>>()
const formula = ref<InstanceType<typeof ActivityFormulaDialog>>()
const tenantId = 'test-tenant'
const tenantOptions = [{ label: '测试租户', value: tenantId }]
const open = () => {
  if (mode === 'bom') {
    return bom.value?.handleOpen({
      tenantId,
      tenantOptions,
      units: [],
      groups: [],
      row: {
        id: 'test-bom',
        tenantId,
        bomCode: 'BOM-TEST',
        materialId: 'parent',
        version: 'V1',
        purpose: 'production',
        status: 'design',
        baseQuantity: 1,
        baseUnitId: 'unit',
        sort: 0,
        items: [
          {
            id: 'item',
            tenantId,
            bomId: 'test-bom',
            componentMaterialId: 'component',
            sequenceNo: 1,
            quantity: 1,
            unitId: 'unit',
            scrapRate: 0,
            mrpEnabled: false,
            issueMethod: '',
            backflushMethod: '',
            overIssueControlMethod: ''
          }
        ]
      }
    })
  }
  if (mode === 'master-group') {
    return group.value?.handleOpen({ domain: 'customer', tenantId, tenantOptions, groups: [] })
  }
  if (mode === 'bom-group') {
    return bomGroup.value?.handleOpen({ tenantId, tenantOptions, groups: [] })
  }
  if (mode === 'activity-formula' || mode === 'formula-history') {
    return formula.value?.handleOpen({
      config: resolveMasterConfig('/mdm/process-master/activity-formula'),
      tenantId,
      tenantOptions,
      groups: [],
      row:
        mode === 'formula-history'
          ? {
              id: 'history-formula',
              tenantId,
              code: 'HISTORY',
              name: '历史用途公式',
              enabled: true,
              purpose: 'legacy-purpose',
              activityTypes: [],
              formulaTokens: []
            }
          : undefined
    })
  }
  if (mode === 'equipment') {
    return equipment.value?.handleOpen({
      targetTenantId: tenantId,
      tenantOptions,
      references: { categories: [], departments: [], locations: [], workCenters: [], suppliers: [] }
    })
  }
  if (mode === 'category') {
    return category.value?.handleOpen({ categories: [], tenantId, tenantOptions })
  }
  return documentDialog.value?.handleOpen({
    mode: 'add',
    categories: [],
    tenantId,
    tenantOptions,
    references: { materials: [], routes: [] }
  })
}
const app = createApp({
  render: () =>
    h(
      'main',
      { class: 'art-page-view h-screen p-4' },
      mode === 'equipment-list'
        ? [h(EquipmentPage)]
        : mode === 'bom-list'
          ? [h(BomPage)]
          : mode === 'catalog-list'
            ? [h(CatalogPage)]
            : mode === 'esop-list'
              ? [h(EsopPage)]
              : [
                  h('button', { type: 'button', onClick: () => void open() }, '打开表单'),
                  mode === 'bom'
                    ? h(BomDialog, { ref: bom })
                    : mode === 'equipment'
                      ? h(EquipmentDialog, { ref: equipment })
                      : mode === 'category'
                        ? h(CategoryDialog, { ref: category })
                        : mode === 'master-group'
                          ? h(GroupDialog, { ref: group })
                          : mode === 'bom-group'
                            ? h(BomGroupDialog, { ref: bomGroup })
                            : mode === 'activity-formula' || mode === 'formula-history'
                              ? h(ActivityFormulaDialog, { ref: formula })
                              : h(DocumentDialog, { ref: documentDialog })
                ]
    )
})
app.use(store)
app.use(language)
app.use(
  createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: {} }]
  })
)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'engineering-dictionary-test',
  tenantId,
  platformSuper: false
})
useMenuStore(store).setButtonList(
  [
    'MdmProductionEquipment:View',
    'MdmEsop:View',
    'MdmEsop:Edit',
    'MdmEsop:Copy',
    'MdmActivityFormula:ManageParameter',
    'MdmBomMaintenance:View'
  ].map((name) => ({
    name,
    path: '',
    type: 'button',
    meta: { title: '测试权限' }
  }))
)
app.mount('#engineering-dictionary-options')
