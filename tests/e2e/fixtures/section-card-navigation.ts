import { createApp, h, ref, type Component } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { initializeTheme, useTheme } from '@/hooks/core/useTheme'
import { SystemThemeEnum } from '@/enums/app-enum'
import { setupGlobDirectives } from '@/directives'
import MasterGroupPanel from '@/components/business/master-group-panel/index.vue'
import WarehouseGroupPanel from '@mdm/views/inventory-master/warehouse-definition/modules/warehouse-group-panel.vue'
import MaterialCategoryPanel from '@mdm/views/material-master/material-category/modules/category-tree-panel.vue'
import BomGroupPanel from '@mdm/views/engineering/bom-maintenance/modules/bom-group-panel.vue'
import SmisDocumentCategory from '@smis/views/safety-production/document-center/shared/document-category-navigator.vue'
import SmisViolationCategory from '@smis/views/safety-production/anti-violation-management/shared/violation-category-navigator.vue'
import SmisMaterialCategory from '@smis/views/safety-production/protective-equipment-management/shared/material-category-navigator.vue'
import SmisDepartment from '@smis/views/basic-data/site/modules/department-navigator.vue'
import SmisQuestionCategory from '@smis/views/qualification-training/question-bank-management/modules/question-category-navigator.vue'
import SmisWasteCategory from '@smis/views/hazardous-waste-management/hazardous-waste-catalog/modules/category-navigator.vue'
import SmisStorageLocation from '@smis/views/equipment-ledger/storage-location/modules/storage-location-navigator.vue'
import SmisEquipmentCategory from '@smis/views/equipment-ledger/equipment-category/modules/equipment-category-navigator.vue'
import SmisPosition from '@smis/views/basic-data/position-work-instruction/modules/position-tree-navigator.vue'
import SmisResponsibility from '@smis/views/basic-data/position-safety-responsibility/modules/organization-navigator.vue'
import SmisQualification from '@smis/views/qualification-training/safety-qualification-management/shared/qualification-catalog-navigator.vue'
import SmisRiskOrganization from '@smis/views/basic-data/position-risk-list/modules/organization-navigator.vue'
import SmisLeaveOrganization from '@smis/views/basic-data/leave-information/modules/organization-navigator.vue'
import SmisOperation from '@smis/views/special-operation-management/shared/operation-type-navigator.vue'
import SmisToolOrganization from '@smis/views/safety-production/tool-requisition/tool-personal-standard/modules/tool-organization-navigator.vue'
import SmisPpeOrganization from '@smis/views/safety-production/protective-equipment-management/ppe-personal-standard/modules/ppe-organization-navigator.vue'
import SmisSiteNavigator from '@smis/views/safety-production/emergency-rescue/hazard-source-ledger/modules/site-navigator.vue'
import SmisEquipmentDimension from '@smis/views/equipment-ledger/equipment-ledger/modules/equipment-dimension-navigator.vue'
import SmisSceneNavigator from '@smis/views/dual-control-system/risk-control/risk-four-color-map/modules/risk-map-scene-navigator.vue'
import SmisPropertyPanel from '@smis/views/dual-control-system/risk-control/risk-four-color-map/modules/risk-map-property-panel.vue'
import SmisSiteSelector from '@smis/views/dual-control-system/risk-control/risk-identification/modules/risk-site-select.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const params = new URLSearchParams(location.search)
const feature = params.get('feature') || 'master'
const components: Record<string, Component> = {
  master: MasterGroupPanel,
  warehouse: WarehouseGroupPanel,
  material: MaterialCategoryPanel,
  bom: BomGroupPanel,
  'smis-document': SmisDocumentCategory,
  'smis-violation': SmisViolationCategory,
  'smis-material': SmisMaterialCategory,
  'smis-department': SmisDepartment,
  'smis-question': SmisQuestionCategory,
  'smis-waste': SmisWasteCategory,
  'smis-storage': SmisStorageLocation,
  'smis-equipment': SmisEquipmentCategory,
  'smis-position': SmisPosition,
  'smis-responsibility': SmisResponsibility,
  'smis-qualification': SmisQualification,
  'smis-risk-org': SmisRiskOrganization,
  'smis-leave-org': SmisLeaveOrganization,
  'smis-operation': SmisOperation,
  'smis-tool-org': SmisToolOrganization,
  'smis-ppe-org': SmisPpeOrganization,
  'smis-site': SmisSiteNavigator,
  'smis-dimension': SmisEquipmentDimension,
  'smis-scene': SmisSceneNavigator,
  'smis-property': SmisPropertyPanel,
  'smis-site-select': SmisSiteSelector
}
const tenantId = '11111111-1111-4111-8111-111111111111'
const rows = Array.from({ length: 40 }, (_, index) => ({
  id: `group-${index}`,
  tenantId,
  domain: 'material',
  parentId: null,
  code: `G${String(index).padStart(2, '0')}`,
  name: `测试分组 ${String(index).padStart(2, '0')}`,
  categoryCode: `G${String(index).padStart(2, '0')}`,
  categoryName: `测试分组 ${String(index).padStart(2, '0')}`,
  organizationName: `测试分组 ${String(index).padStart(2, '0')}`,
  organizationCode: `G${String(index).padStart(2, '0')}`,
  locationName: `测试分组 ${String(index).padStart(2, '0')}`,
  locationCode: `G${String(index).padStart(2, '0')}`,
  key: `group-${index}`,
  label: `测试分组 ${String(index).padStart(2, '0')}`,
  description: `G${String(index).padStart(2, '0')}`,
  nodeType: 'position',
  organizationId: 'fixture-organization',
  positionId: `position-${index}`,
  itemName: `测试分组 ${String(index).padStart(2, '0')}`,
  itemCode: `G${String(index).padStart(2, '0')}`,
  nodeKind: 'category',
  typeName: `测试分组 ${String(index).padStart(2, '0')}`,
  typeCode: `G${String(index).padStart(2, '0')}`,
  siteName: `测试分组 ${String(index).padStart(2, '0')}`,
  sceneName: `测试分组 ${String(index).padStart(2, '0')}`,
  sceneCode: `G${String(index).padStart(2, '0')}`,
  shapes: [],
  status: 'enabled',
  enabled: true,
  sort: index,
  remark: ''
}))
const selectedId = ref(feature.startsWith('smis-') && feature !== 'smis-operation' ? 'all' : '')
const state = ref('success')
const readonly = params.has('readonly')
const lastAction = ref('')
const narrow = useMediaQuery('(max-width: 900px)')
const sceneKeyword = ref('')
const dimension = ref('category')
const shape = ref({
  id: 'fixture-shape',
  label: '测试图形',
  shapeType: 'rectangle',
  x: 10,
  y: 10,
  width: 100,
  height: 100,
  rotation: 0,
  fillColor: '#d14a48',
  fillOpacity: 0.5,
  borderColor: '#d14a48',
  borderOpacity: 1,
  borderWidth: 1
})
function getId(value: unknown): string {
  if (typeof value === 'string') return value
  return value && typeof value === 'object' && 'id' in value ? String(value.id) : ''
}
useUserStore(store).setUserInfo({ userId: 'navigation-test', tenantId, platformSuper: false })
useMenuStore(store).setButtonList(
  (readonly
    ? []
    : [
        'FixtureGroup:ManageGroup',
        'MdmWarehouseDefinition:ManageGroup',
        'MdmMaterialCategory:Add',
        'MdmMaterialCategory:Edit',
        'MdmBomMaintenance:ManageGroup',
        'SmisRequiredKnowledge:CategoryAdd',
        'SmisRequiredKnowledge:CategoryEdit',
        'SmisRequiredKnowledge:CategoryDelete',
        'SmisQuestionBankManagement:ManageCategory',
        'SmisHazardousWasteCatalog:AddCategory',
        'SmisHazardousWasteCatalog:EditCategory',
        'SmisHazardousWasteCatalog:DeleteCategory'
      ]
  ).map((name) => ({ name, path: '', type: 'button', meta: { title: '测试权限' } }))
)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }]
})
const app = createApp({
  render: () =>
    h(ElConfigProvider, { locale: zhCn }, () =>
      h('main', { class: 'min-w-0 p-4' }, [
        h('nav', { class: 'mb-4 flex flex-wrap gap-3', 'aria-label': '验收状态' }, [
          ...['success', 'loading', 'error', 'empty'].map((value) =>
            h('button', { type: 'button', onClick: () => (state.value = value) }, value)
          ),
          h(
            'button',
            { type: 'button', onClick: () => useTheme().switchThemeStyles(SystemThemeEnum.DARK) },
            '深色主题'
          )
        ]),
        h(
          'div',
          {
            style: {
              display: 'flex',
              flexDirection: 'column',
              width: '380px',
              maxWidth: '100%',
              height: feature === 'master' && narrow.value ? 'auto' : '520px'
            }
          },
          h(components[feature], {
            ...(feature === 'master'
              ? {
                  title: '物料分组',
                  managePermission: readonly ? undefined : 'FixtureGroup:ManageGroup'
                }
              : {}),
            ...(['smis-property', 'smis-site-select', 'smis-scene', 'smis-dimension'].includes(
              feature
            )
              ? {}
              : feature.startsWith('smis-')
                ? { data: state.value === 'empty' ? [] : rows }
                : feature === 'material'
                  ? { categories: state.value === 'empty' ? [] : rows }
                  : { groups: state.value === 'empty' ? [] : rows }),
            ...(feature === 'smis-operation'
              ? { selectedId: selectedId.value || null }
              : feature === 'smis-scene'
                ? {
                    selectedId: selectedId.value,
                    rows: state.value === 'empty' ? [] : rows,
                    treeData:
                      state.value === 'empty'
                        ? []
                        : rows.filter((row) => row.sceneName.includes(sceneKeyword.value)),
                    keyword: sceneKeyword.value,
                    'onUpdate:keyword': (value: string) => (sceneKeyword.value = value)
                  }
                : ['smis-property', 'smis-site-select'].includes(feature)
                  ? {}
                  : feature.startsWith('smis-')
                    ? { selectedKey: selectedId.value }
                    : { selectedId: selectedId.value }),
            ...(feature === 'smis-question' ? { totalQuestions: 40 } : {}),
            ...(feature === 'smis-responsibility' ? { allKey: 'all' } : {}),
            ...(feature === 'smis-qualification' ? { title: '资质类别' } : {}),
            ...(['smis-tool-org', 'smis-ppe-org'].includes(feature) ? { employeeCount: 40 } : {}),
            ...(feature === 'smis-dimension'
              ? {
                  categoryTree: state.value === 'empty' ? [] : rows,
                  locationTree: state.value === 'empty' ? [] : rows,
                  selectedDimension: dimension.value,
                  'onUpdate:dimension': (value: string) => (dimension.value = value)
                }
              : {}),
            ...(feature === 'smis-site-select'
              ? {
                  sites: rows,
                  modelValue: selectedId.value,
                  'onUpdate:modelValue': (value: string) => (selectedId.value = value)
                }
              : {}),
            ...(feature === 'smis-property'
              ? {
                  modelValue: state.value === 'empty' ? undefined : shape.value,
                  'onUpdate:modelValue': (value: typeof shape.value) => (shape.value = value),
                  scene: {
                    id: 'fixture-scene',
                    sceneName: '测试场景',
                    canvasWidth: 1000,
                    canvasHeight: 1000
                  },
                  riskPoints: [],
                  riskColors: ['#d14a48']
                }
              : {}),
            loading: state.value === 'loading',
            error:
              state.value === 'error'
                ? feature === 'bom'
                  ? new Error('导航加载失败，请重试')
                  : '导航加载失败，请重试'
                : feature === 'bom'
                  ? null
                  : '',
            onSelect: (value: unknown, key?: string) =>
              (selectedId.value = feature === 'smis-dimension' ? key || '' : getId(value)),
            onRefresh: () => {
              state.value = 'success'
              lastAction.value = '刷新导航'
            },
            onAdd: () => (lastAction.value = '新增分组'),
            onEdit: () => (lastAction.value = '编辑分组'),
            onRemove: () => (lastAction.value = '删除分组')
          })
        ),
        h('output', { 'aria-label': '选中分组' }, selectedId.value),
        h('output', { 'aria-label': '最近操作' }, lastAction.value),
        feature === 'smis-property'
          ? h('output', { 'aria-label': '图形文字' }, shape.value.label)
          : null
      ])
    )
})
app.use(store)
app.use(language)
app.use(router)
setupGlobDirectives(app)
initializeTheme()
document.documentElement.dataset.uiScope = 'workspace'
useTheme().switchThemeStyles(SystemThemeEnum.LIGHT)
document.documentElement.dataset.boxMode = 'border-mode'
await router.push('/')
app.mount('#navigation-preview')
