import { createApp, h, ref } from 'vue'
import { fetchEmployeeSelectorList } from '@/api/integration/employees'
import { fetchEmployeeSelectorList as fetchHrEmployeeSelectorList } from '../../../modules/art-supabase-hr/src/api'
import { fetchMdmCatalogPage } from '../../../modules/art-supabase-mdm/src/api/modules/catalog'
import { fetchProductionEquipment } from '../../../modules/art-supabase-mdm/src/api/modules/equipment'
import {
  fetchInventoryReservations,
  fetchInventoryPackages,
  fetchInventorySerials
} from '../../../modules/art-supabase-mdm/src/api/modules/inventory-storage'
import {
  fetchWmsProductionStockPage,
  fetchWmsProductionMaterialPage,
  fetchWmsFinishedInboundSourcePage
} from '../../../modules/art-supabase-wms/src/api/production-material'
import {
  fetchPmisEquipmentOptions,
  fetchPmisPlans,
  fetchPmisTasks,
  fetchPmisRepairTasks
} from '../../../modules/art-supabase-pmis/src/api/pmis'
import { store } from '@/store'
import { fetchAiPromptList } from '@/api/ai-prompt'
import { fetchAiFeatureConfigList } from '@/api/ai-configuration'
import { fetchAiRunList } from '@/api/ai-operations'
import {
  fetchWmsInitialStockPage,
  fetchWmsInitialMaterials
} from '../../../modules/art-supabase-wms/src/api/initialization'
import { fetchWmsInitialSalesPage } from '../../../modules/art-supabase-wms/src/api/initial-sales'
import {
  fetchWorkOrders,
  fetchOperationTasks
} from '../../../modules/art-supabase-mes/src/api/manufacturing'
import {
  fetchExecutionTasks,
  fetchProductionReports,
  fetchExecutionEvents
} from '../../../modules/art-supabase-mes/src/api/execution'
import {
  fetchWmsPurchaseDocumentIdPage,
  fetchWmsPurchasePage,
  fetchWmsPurchaseMaterials,
  fetchWmsPurchaseSourceBatches
} from '@/api/wms-purchase'
import { fetchDocumentTypeList } from '../../../modules/art-supabase-mdm/src/api/modules/document-type'
import { fetchBusinessTypeList } from '../../../modules/art-supabase-mdm/src/api/modules/business-type'
import {
  fetchWarehouseWorkspace,
  fetchSupplyChainCodeRules,
  fetchOutboundRules
} from '../../../modules/art-supabase-mdm/src/api/modules/inventory'
import { fetchMovementTypePage } from '../../../modules/art-supabase-mdm/src/api/modules/movement-type'
import { fetchBoms } from '../../../modules/art-supabase-mdm/src/api/modules/bom'
import { fetchComponentTypes } from '../../../modules/art-supabase-mdm/src/api/modules/component-type'
import { fetchEsopDocuments } from '../../../modules/art-supabase-mdm/src/api/modules/esop'
import {
  fetchMaterialReferences,
  fetchMaterialArchives
} from '../../../modules/art-supabase-mdm/src/api/modules/material'
import { fetchInventoryBatches } from '../../../modules/art-supabase-mdm/src/api/modules/inventory-storage'
import { fetchPurchaseSuppliers } from '../../../modules/art-supabase-mdm/src/api/modules/supplier'
import { fetchOperationalMaster } from '../../../modules/art-supabase-mdm/src/api/modules/operational-master'
import {
  fetchProductionPersonSelector,
  fetchWorkstationScope
} from '../../../modules/art-supabase-mdm/src/api/modules/workspaces'
import {
  fetchMdmQualityIssues,
  fetchMdmChangeRequests,
  fetchMdmMatchCandidates,
  fetchMdmOutboxDeliveries
} from '../../../modules/art-supabase-mdm/src/api/modules/governance'
import { fetchStorageMaterialsPage } from '../../../modules/art-supabase-mdm/src/api/modules/inventory-storage'
import {
  fetchProductionPeople,
  fetchProductionEmployeeOptions
} from '../../../modules/art-supabase-mdm/src/api/modules/production'
import {
  fetchWmsMaterialOptions,
  fetchWmsProjectSectionPage,
  fetchWmsStockPage,
  fetchWmsSalesReturnAllocationPage,
  fetchWmsMovementPage,
  fetchWmsDirectTransferPage,
  fetchWmsSerialPage,
  fetchWmsTransferPage,
  fetchWmsTransferRequestPage,
  fetchWmsCountAdjustmentPage,
  fetchWmsIssueRequestPage,
  fetchWmsCountPlanPage,
  fetchWmsAdjustmentPage,
  fetchWmsAssemblyPage,
  fetchWmsProjectWorkOrderPage,
  fetchWmsProjectPackPage,
  fetchWmsProjectMaterialPage,
  fetchWmsProjectMovementPage
} from '../../../modules/art-supabase-wms/src/api/warehouse'
import {
  fetchOperationTemplates,
  fetchWorkCenters,
  fetchWorkCenterReferenceOptions,
  fetchAvailableMainCenters,
  fetchWorkstations,
  fetchPersonnelWorkCenterConfigs,
  fetchProductionReferences,
  fetchProcessRouteMaterialOptions,
  fetchProcessRoutes,
  fetchProcessSteps
} from '../../../modules/art-supabase-mdm/src/api/modules/workspaces'

const result = ref('未检查')
const valid = new URLSearchParams(location.search).get('valid') === 'true'
const aiOnly = new URLSearchParams(location.search).get('aiOnly') === 'true'
const app = createApp({
  render: () =>
    h('main', [
      h(
        'button',
        {
          onClick: async () => {
            let rejected = 0
            let accepted = 0
            for (const current of valid ? [2] : [0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER]) {
              const query = { tenantId: 'tenant-a', keyword: '', current, size: aiOnly ? 200 : 20 }
              const calls = [
                () => fetchAiPromptList(query),
                () => fetchAiFeatureConfigList(query),
                () => fetchAiRunList(query),
                () =>
                  fetchMdmCatalogPage('material', {
                    ...query,
                    sourceType: 'material',
                    state: 'active',
                    quality: 'complete'
                  }),
                () => fetchProductionEquipment(query),
                () => fetchInventoryReservations(query),
                () => fetchInventoryPackages({ ...query, warehouseId: 'warehouse-a' }),
                () => fetchInventorySerials(query),
                () => fetchWmsProductionStockPage(query),
                () => fetchWmsProductionMaterialPage({ ...query, kind: 'issue' }),
                () =>
                  fetchWmsFinishedInboundSourcePage({
                    tenantId: query.tenantId,
                    page: current,
                    pageSize: query.size,
                    workOrderId: 'work-order-a'
                  }),
                () => fetchPmisEquipmentOptions(query),
                () => fetchPmisPlans('inspection', query),
                () => fetchPmisTasks('inspection', query),
                () => fetchPmisRepairTasks(query),
                () => fetchWmsInitialStockPage(query),
                () => fetchWmsInitialMaterials(query),
                () => fetchWmsInitialSalesPage({ ...query, kind: 'initial_outbound' }),
                () => fetchWorkOrders(query),
                () => fetchOperationTasks(query),
                () => fetchExecutionTasks(query),
                () => fetchProductionReports(query),
                () => fetchExecutionEvents(query),
                () => fetchOperationTemplates(query),
                () => fetchWorkCenters(query),
                () => fetchWorkCenterReferenceOptions('equipment', 'tenant-a', '', current, 20),
                () => fetchAvailableMainCenters('', current, 20),
                () => fetchWorkstations({ ...query, workCenterId: 'center' }),
                () => fetchPersonnelWorkCenterConfigs(query),
                () => fetchProductionReferences('material', 'tenant-a', '', current, 20),
                () => fetchProcessRouteMaterialOptions(query),
                () => fetchProcessRoutes(query),
                () => fetchProcessSteps(query),
                () => fetchDocumentTypeList(query),
                () => fetchBusinessTypeList(query),
                () => fetchWarehouseWorkspace(query),
                () => fetchSupplyChainCodeRules(query),
                () => fetchOutboundRules(query),
                () => fetchMovementTypePage(query),
                () => fetchBoms(query),
                () => fetchComponentTypes(query),
                () => fetchEsopDocuments(query),
                () => fetchMaterialReferences('unit-of-measure', query),
                () => fetchMaterialReferences('material-type', query),
                () => fetchMaterialReferences('attribute-group', query),
                () => fetchMaterialReferences('code-rule', query),
                () => fetchMaterialArchives(query),
                () => fetchInventoryBatches(query),
                () => fetchPurchaseSuppliers(query),
                () => fetchOperationalMaster('customer', query),
                () => fetchOperationalMaster('project', query),
                () => fetchOperationalMaster('activity-formula', query),
                () => fetchOperationalMaster('operation-control-code', query),
                () => fetchOperationalMaster('operation', query),
                () => fetchOperationalMaster('workstation', query),
                () => fetchMdmQualityIssues(query),
                () => fetchMdmChangeRequests(query),
                () => fetchMdmMatchCandidates(query),
                () => fetchMdmOutboxDeliveries(query),
                () => fetchStorageMaterialsPage('tenant-a', '', current, 20),
                () => fetchProductionPeople(query),
                () => fetchWmsMaterialOptions('tenant-a', '', current, 20),
                () => fetchWmsProjectSectionPage(query),
                () => fetchWmsStockPage(query),
                () => fetchWmsSalesReturnAllocationPage(query),
                () => fetchWmsMovementPage(query),
                () => fetchWmsDirectTransferPage(query),
                () => fetchWmsSerialPage(query),
                () => fetchWmsSerialPage({ ...query, projectId: 'project-a' }),
                () => fetchWmsTransferPage(query),
                () => fetchWmsTransferRequestPage(query),
                () => fetchWmsCountAdjustmentPage('gain', query),
                () => fetchWmsIssueRequestPage(query),
                () => fetchWmsCountPlanPage(query),
                () => fetchWmsAdjustmentPage(query),
                () => fetchWmsAssemblyPage(query),
                () => fetchWmsProjectWorkOrderPage({ ...query, projectId: 'project-a' }),
                () => fetchWmsProjectPackPage({ ...query, projectId: 'project-a' }),
                () => fetchWmsProjectMaterialPage({ ...query, projectId: 'project-a' }),
                () => fetchWmsProjectMovementPage({ ...query, projectId: 'project-a' }),
                () => fetchWmsPurchaseDocumentIdPage({ ...query, kind: 'purchase_inbound' }),
                () => fetchWmsPurchasePage({ ...query, kind: 'purchase_inbound' }),
                () => fetchWmsPurchaseMaterials(query),
                () =>
                  fetchWmsPurchaseSourceBatches({
                    ...query,
                    organizationId: 'organization-a',
                    materialId: 'material-a',
                    warehouseId: 'warehouse-a',
                    binId: null,
                    projectId: null,
                    constructionNo: null,
                    ownerType: 'company',
                    ownerId: null,
                    stockType: 'owned',
                    stockStatus: 'normal'
                  })
              ]
              for (const call of aiOnly ? calls.slice(0, 3) : calls) {
                try {
                  await call()
                  accepted++
                } catch (error) {
                  if (error instanceof RangeError) rejected++
                }
              }
            }
            result.value = valid ? `${accepted} 个请求完成` : `${rejected} 个参数拒绝`
          }
        },
        '校验非法分页'
      ),
      h(
        'button',
        {
          onClick: async () => {
            let rejected = 0
            for (const value of [NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
              for (const params of [
                { from: value, to: 9 },
                { from: 0, to: value }
              ]) {
                try {
                  await fetchProductionPersonSelector(params)
                } catch (error) {
                  if (error instanceof RangeError) rejected++
                  else throw error
                }
              }
            }
            for (const [from, to] of [
              [-10, -5],
              [-10, 9],
              [20, 9],
              [20, 39]
            ]) {
              await fetchProductionPersonSelector({ from, to })
            }
            result.value = `${rejected} 个选择器参数拒绝，4 个范围保留`
          }
        },
        '校验人员选择器范围'
      ),
      h('output', { 'data-testid': 'result' }, result.value),
      h(
        'button',
        {
          onClick: async () => {
            let rejected = 0
            for (const params of [{ from: NaN }, { to: Infinity }]) {
              try {
                await fetchProductionEmployeeOptions(params)
              } catch (error) {
                if (error instanceof RangeError) rejected++
                else throw error
              }
            }
            const first = await fetchProductionEmployeeOptions()
            const second = await fetchProductionEmployeeOptions()
            result.value = JSON.stringify({
              rejected,
              permissions: [first.fieldAccess, second.fieldAccess]
            })
          }
        },
        '校验生产员工字段权限'
      ),
      h(
        'button',
        {
          onClick: async () => {
            if (fetchHrEmployeeSelectorList !== fetchEmployeeSelectorList)
              throw new Error('员工选择器未使用统一实现')
            let rejected = 0
            for (const fetch of [fetchEmployeeSelectorList, fetchHrEmployeeSelectorList]) {
              for (const range of [
                { from: NaN, to: 9 },
                { from: 0, to: Infinity }
              ]) {
                try {
                  await fetch(range)
                } catch (error) {
                  if (error instanceof RangeError) rejected++
                  else throw error
                }
              }
            }
            const rows = []
            for (const fetch of [fetchEmployeeSelectorList, fetchHrEmployeeSelectorList]) {
              rows.push(await fetch({ tenantId: 'tenant-a', keyword: ' 员工 ', from: 20, to: 39 }))
            }
            result.value = JSON.stringify({ rejected, rows })
          }
        },
        '校验员工选择器复用'
      ),
      h(
        'button',
        {
          onClick: async () => {
            let rejected = 0
            for (const size of [0, -1, 1.5, Infinity, 101]) {
              try {
                await fetchMdmCatalogPage('material', { current: 2, size })
              } catch (error) {
                if (error instanceof RangeError) rejected++
                else throw error
              }
            }
            const page = await fetchMdmCatalogPage('material', { current: 2, size: 100 })
            result.value = `${rejected} 个目录页长拒绝，返回第 ${page.current} 页 ${page.size} 条范围`
          }
        },
        '校验目录页长'
      ),
      h(
        'button',
        {
          onClick: async () => {
            try {
              const tenantId = new URLSearchParams(location.search).get('scopeTenant')
              const scope = await fetchWorkstationScope(tenantId)
              result.value = JSON.stringify({
                departments: scope.departments.map((row) => row.id),
                workCenters: scope.workCenters.map((row) => row.id)
              })
            } catch {
              result.value = '范围查询失败，未返回部分结果'
            }
          }
        },
        '加载工位范围'
      )
    ])
})
app.use(store)
app.mount('#production-pagination')
