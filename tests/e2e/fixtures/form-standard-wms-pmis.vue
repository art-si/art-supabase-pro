<template>
  <ElConfigProvider :locale="zhCn"
    ><main class="p-4"
      ><ElButton data-testid="open" @click="open">打开验收入口</ElButton
      ><output data-testid="ready">{{ opened ? 'ready' : 'opening' }}</output
      ><component :is="scenario.component" ref="target" v-bind="scenario.props" /></main
  ></ElConfigProvider>
</template>
<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { ElButton, ElConfigProvider } from 'element-plus'
  import zhCn from 'element-plus/es/locale/lang/zh-cn'
  import PlanDialog from '@pmis/views/components/plan-dialog.vue'
  import RepairDialog from '@pmis/views/components/repair-task-dialog.vue'
  import SettingDialog from '@pmis/views/components/department-setting-dialog.vue'
  import ExecutionDialog from '@pmis/views/components/task-execution-dialog.vue'
  import CountCreate from '@wms/views/count-business/count/modules/count-create-dialog.vue'
  import InitialStock from '@wms/views/initialization/initial-stock/modules/initial-stock-drawer.vue'
  import InitialSales from '@wms/views/initialization/initial-sales/modules/initial-sales-drawer.vue'
  import CountAdjustment from '@wms/views/count-business/modules/count-adjustment-drawer.vue'
  import TransferRequest from '@wms/views/transfer-business/transfer-request/modules/transfer-request-drawer.vue'
  import Assembly from '@wms/views/adjustment-business/assembly/modules/assembly-dialog.vue'
  import {
    tenantId,
    organization,
    warehouse,
    plan,
    task,
    repair,
    setting,
    stockDocument
  } from './form-standard-wms-pmis-data'
  const params = new URLSearchParams(location.search)
  const kind = params.get('kind') || 'inspection'
  const mode = params.get('mode') || 'edit'
  const target = ref<{ handleOpen: (...args: unknown[]) => Promise<void> }>()
  const opened = ref(false)
  const scenario = computed(() => {
    switch (params.get('entry')) {
      case 'plan':
        return {
          component: PlanDialog,
          props: { workspaceKind: kind },
          args: [
            {
              kind,
              tenantOptions: [{ label: '验收租户', value: tenantId }],
              row: { ...plan, planKind: kind },
              copy: mode === 'copy'
            }
          ]
        }
      case 'repair':
        return {
          component: RepairDialog,
          props: {},
          args: [{ tenantId, row: mode === 'add' ? undefined : repair, copy: mode === 'copy' }]
        }
      case 'setting':
        return {
          component: SettingDialog,
          props: {},
          args: [{ kind, tenantId, row: mode === 'add' ? undefined : setting }]
        }
      case 'execution':
        return {
          component: ExecutionDialog,
          props: {},
          args: [{ task: { ...task, plan: { ...plan, planKind: kind } } }]
        }
      case 'count':
        return {
          component: CountCreate,
          props: {},
          args: [
            {
              tenantId,
              organizations: [organization],
              warehouses: [warehouse],
              projects: [],
              sections: []
            }
          ]
        }
      case 'stock':
        return { component: InitialStock, props: {}, args: [{ mode, document: stockDocument }] }
      case 'sales':
        return {
          component: InitialSales,
          props: {
            kind: kind === 'inspection' ? 'other_outbound' : kind,
            importPermission: 'WmsOtherOutbound:Import'
          },
          args: [{ tenantId, mode, documentId: 'sales-doc-1' }]
        }
      case 'gain':
        return {
          component: CountAdjustment,
          props: { kind: kind === 'inspection' ? 'gain' : kind },
          args: [{ tenantId, mode, documentId: 'adjustment-doc-1' }]
        }
      case 'transfer':
        return {
          component: TransferRequest,
          props: {},
          args: [{ tenantId, mode, documentId: 'transfer-doc-1' }]
        }
      default:
        return { component: Assembly, props: {}, args: [{ tenantId, projects: [] }] }
    }
  })
  const open = async () => {
    opened.value = false
    await target.value?.handleOpen(...scenario.value.args)
    opened.value = true
  }
</script>
