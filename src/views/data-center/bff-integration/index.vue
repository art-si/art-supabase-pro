<template>
  <div class="bff-integration business-workspace-page art-full-height">
    <BusinessWorkspaceHeader
      density="compact"
      eyebrow="PUBLISHED API ACCESS"
      title="BFF 接入中心"
      description="选择已授权的发布接口，填写参数并查看调用结果。"
      icon="ri:links-line"
    >
      <template #actions>
        <BusinessTableWorkspaceActions :table="catalogTableRef" />
      </template>
    </BusinessWorkspaceHeader>

    <ArtTableQuery
      ref="catalogTableRef"
      :style="compactViewport ? { height: '620px', flex: 'none' } : undefined"
      v-model="catalogFilters"
      focusable
      :api-fn="loadCatalog"
      :columns-factory="catalogColumns"
      :search-items="catalogSearchItems"
      :header-actions="catalogHeaderActions"
      header-actions-placement="workspace"
      :enable-cache="false"
      :search-bar-props="{ showExpand: false, span: 8, labelWidth: 64 }"
      :table-header-props="{ layout: 'refresh,size' }"
      :table-props="{
        rowKey: 'interfaceId',
        emptyText: '没有符合条件的已发布接口',
        emptyDescription: '请调整筛选条件；如仍为空，请联系 BFF 管理员核对应用授权和发布状态。'
      }"
    >
      <template #header-left>
        <span class="text-sm text-g-700"
          >已授权接口 <strong class="text-g-900">{{ allApis.length }}</strong></span
        >
      </template>
    </ArtTableQuery>

    <ArtDrawer ref="invocationDrawerRef" size="xl" :show-footer="false">
      <div v-if="selectedApi" class="grid min-w-0 gap-6">
        <ArtSectionCard
          :title="selectedApi.name"
          :subtitle="`${selectedApi.applicationName} · ${environmentLabel(selectedApi.environment)} · ${selectedApi.path}`"
          preserve-content-structure
        >
          <div class="grid min-w-0 gap-4">
            <div class="flex min-w-0 flex-wrap items-center gap-2">
              <ElTag type="primary" effect="plain">{{ selectedApi.method }}</ElTag>
              <ElTag effect="plain">发布 V{{ selectedApi.version }}</ElTag>
              <ElTag :type="selectedApi.resultKind === 'page' ? 'success' : 'info'" effect="light">
                {{ selectedApi.resultKind === 'page' ? '分页记录' : '普通字段' }}
              </ElTag>
            </div>
            <ElAlert
              v-if="selectedApi.method !== 'GET'"
              title="此接口可能写入业务数据。请确认输入和操作范围；不确定结果时，先按请求编号核对，避免重复提交。"
              type="warning"
              :closable="false"
              show-icon
            />
            <ElAlert
              v-if="writeReviewNeeded"
              title="上次写调用的结果尚未确认。请先按请求编号核对业务结果，再决定是否发起新调用。"
              type="warning"
              :closable="false"
              show-icon
            >
              <ElButton link type="primary" @click="writeReviewNeeded = false"
                >已核对结果，允许新调用</ElButton
              >
            </ElAlert>
            <ArtForm
              v-if="inputItems.length"
              ref="inputFormRef"
              v-model="inputValues"
              :items="inputItems"
              :rules="inputRules"
              :span="12"
              :gutter="16"
              label-position="top"
            />
            <p v-else class="text-sm text-g-700">此接口无需填写参数，可直接运行。</p>
            <ElAlert
              v-if="selectedApi.resultKind === 'page' && !selectedApi.pagination"
              title="该分页接口缺少已发布的分页输入声明，暂不能调用。"
              type="warning"
              :closable="false"
              show-icon
            />
            <div class="flex flex-wrap items-center gap-3">
              <ElButton
                type="primary"
                :loading="running"
                :disabled="
                  writeReviewNeeded ||
                  (selectedApi.resultKind === 'page' && !selectedApi.pagination)
                "
                @click="runSelected"
              >
                <ArtSvgIcon icon="ri:play-circle-line" />{{
                  selectedApi.resultKind === 'page' ? '查询分页记录' : '运行接口'
                }}
              </ElButton>
              <span class="text-xs text-g-700">调用使用当前统一登录身份与 BFF 应用权限。</span>
            </div>
            <ElAlert
              v-if="runError"
              :title="runError"
              :description="requestId ? `请求编号：${requestId}` : undefined"
              type="error"
              :closable="false"
              show-icon
            />
          </div>
        </ArtSectionCard>

        <ArtSectionCard
          v-if="selectedApi && (gatewayResult || (pageRequested && !runError))"
          title="实际调用结果"
          subtitle="真实数据来自当前已发布接口；只显示发布合同声明的输出字段。"
          preserve-content-structure
        >
          <div class="grid min-w-0 gap-3">
            <div class="flex flex-wrap items-center gap-2 text-sm text-g-700" role="status">
              <ElTag v-if="requestId && !runError" type="success" effect="light">调用成功</ElTag>
              <span v-if="requestId" class="min-w-0 break-all"
                >请求编号 <code class="font-mono">{{ requestId }}</code></span
              >
              <span v-if="resultVersion">运行版本 V{{ resultVersion }}</span>
            </div>
            <ElTabs
              v-model="resultTab"
              class="min-w-0"
              @tab-change="responsePreviewRef?.invalidateCopy()"
            >
              <ElTabPane label="数据视图" name="data">
                <ArtTableQuery
                  v-if="selectedApi.resultKind === 'page'"
                  :key="pageRequestKey"
                  ref="pageTableRef"
                  :style="{ height: compactViewport ? '520px' : '360px', flex: 'none' }"
                  :api-fn="loadPage"
                  :api-params="pageApiParams"
                  :columns-factory="pageColumns"
                  :immediate="false"
                  :enable-cache="false"
                  :table-header-props="{ layout: 'refresh,size' }"
                  :table-props="{
                    emptyText: '本页没有记录',
                    emptyDescription: '可检查分页输入或调整页码后重试。'
                  }"
                />
                <ArtDescriptions
                  v-else
                  :data="{}"
                  :items="scalarDescriptions"
                  :columns="2"
                  border
                />
              </ElTabPane>
              <ElTabPane label="JSON 响应" name="json">
                <PlanCodePreview
                  v-if="gatewayResult"
                  ref="responsePreviewRef"
                  title="已校验的接口响应"
                  :code="JSON.stringify(gatewayResult, null, 2)"
                  language="json"
                  expanded
                  max-height="480px"
                />
                <ArtEmptyState
                  v-else
                  title="暂无成功响应"
                  description="运行接口成功后，可在此查看 JSON 响应。"
                  size="compact"
                />
              </ElTabPane>
            </ElTabs>
          </div>
        </ArtSectionCard>
      </div>
    </ArtDrawer>

    <ArtDrawer ref="responseGuideDrawerRef" size="lg" :show-footer="false">
      <ResponseGuide />
    </ArtDrawer>
  </div>
</template>

<script setup lang="tsx">
  import { ElButton, ElTabPane, ElTabs, ElTag } from 'element-plus'
  import type { FormRules } from 'element-plus'
  import { fetchBffCatalog, fetchBffPage, invokeBffInterface, BffBridgeError } from '@/api/bff'
  import type { BffGatewayResult, BffPublishedApi, BffScalar } from '@/types/platform/bff'
  import type { ColumnOption } from '@/types'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type {
    ArtTableQueryExpose,
    ArtTableQueryHeaderAction
  } from '@/components/core/tables/art-table-query/index.vue'
  import type ArtForm from '@/components/core/forms/art-form/index.vue'
  import type { FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtDescriptions from '@/components/core/base/art-descriptions/index.vue'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import BusinessWorkspaceHeader from '@/components/business/business-workspace-header/index.vue'
  import PlanCodePreview, {
    type PlanCodePreviewExpose
  } from '@/views/data-center/sql-console/modules/plan-code-preview.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import { uniq } from 'lodash-es'
  import { useWindowSize } from '@vueuse/core'
  import ResponseGuide from './modules/response-guide.vue'

  const { confirmAction } = useArtFeedback()
  const { width: viewportWidth } = useWindowSize()
  const compactViewport = computed(() => viewportWidth.value <= 768)
  const booleanOptions = useDictionaryOptions('commonBoolean', (value) => value === 'true')
  const catalogTableRef = ref<ArtTableQueryExpose>()
  const pageTableRef = ref<ArtTableQueryExpose>()
  const inputFormRef = ref<InstanceType<typeof ArtForm>>()
  const invocationDrawerRef = ref<ArtDrawerExpose>()
  const responseGuideDrawerRef = ref<ArtDrawerExpose>()
  const responsePreviewRef = ref<PlanCodePreviewExpose>()
  const resultTab = ref('data')
  const catalogHeaderActions: ArtTableQueryHeaderAction[] = [
    {
      key: 'responseGuide',
      label: '响应格式说明',
      icon: 'ri:book-open-line',
      onClick: openResponseGuide
    }
  ]
  const catalogFilters = ref({ name: '', environment: '' })
  const allApis = shallowRef<BffPublishedApi[]>([])
  const selectedApi = shallowRef<BffPublishedApi>()
  const inputValues = ref<Record<string, BffScalar>>({})
  const gatewayResult = shallowRef<BffGatewayResult>()
  const pageRequested = ref(false)
  const pageRequestKey = ref(0)
  const requestId = ref('')
  const resultVersion = ref<number>()
  const runError = ref('')
  const running = ref(false)
  const writeReviewNeeded = ref(false)
  const pageApiParams = computed(() => {
    const pagination = selectedApi.value?.pagination
    return pagination
      ? {
          current: inputValues.value[pagination.currentInputKey],
          size: inputValues.value[pagination.sizeInputKey]
        }
      : { current: 1, size: 20 }
  })

  const catalogSearchItems = computed<SearchFormItem[]>(() => [
    {
      key: 'name',
      label: '接口',
      type: 'input',
      props: { placeholder: '搜索接口、应用或路径', clearable: true }
    },
    {
      key: 'environment',
      label: '环境',
      type: 'select',
      props: {
        placeholder: '全部环境',
        clearable: true,
        options: uniq(allApis.value.map((api) => api.environment)).map((value) => ({
          label: environmentLabel(value),
          value
        }))
      }
    }
  ])

  function friendlyError(error: unknown, fallback: string): string {
    return error instanceof BffBridgeError ? error.message : fallback
  }
  async function loadCatalog(params: Record<string, unknown>) {
    try {
      const response = await fetchBffCatalog()
      allApis.value = response.records
      if (selectedApi.value) {
        const current = response.records.find(
          (api) => api.interfaceId === selectedApi.value?.interfaceId
        )
        if (!current) {
          selectedApi.value = undefined
          gatewayResult.value = undefined
          pageRequested.value = false
        } else if (current.version !== selectedApi.value.version) selectApi(current, false)
      }
      const name = typeof params.name === 'string' ? params.name.trim().toLowerCase() : ''
      const environment = typeof params.environment === 'string' ? params.environment : ''
      const records = response.records.filter(
        (api) =>
          (!name ||
            `${api.name} ${api.code} ${api.applicationName} ${api.applicationCode} ${api.path}`
              .toLowerCase()
              .includes(name)) &&
          (!environment || api.environment === environment)
      )
      const current = Math.max(1, Number(params.current) || 1)
      const size = Math.max(1, Number(params.size) || 20)
      return {
        records: records.slice((current - 1) * size, current * size),
        total: records.length,
        current,
        size
      }
    } catch (error) {
      allApis.value = []
      selectedApi.value = undefined
      gatewayResult.value = undefined
      pageRequested.value = false
      throw new Error(friendlyError(error, '接口目录暂时无法加载，请刷新后重试'), { cause: error })
    }
  }
  function catalogColumns(): ColumnOption<BffPublishedApi>[] {
    return [
      {
        prop: 'name',
        label: '已发布接口',
        minWidth: 220,
        formatter: (api) => (
          <div class="min-w-0 py-1">
            <strong class="block truncate font-medium text-g-900" title={api.name}>
              {api.name}
            </strong>
            <span class="block truncate font-mono text-xs text-g-700" title={api.code}>
              {api.code}
            </span>
          </div>
        )
      },
      {
        prop: 'applicationName',
        label: '所属应用',
        minWidth: 170,
        showOverflowTooltip: true
      },
      {
        prop: 'environment',
        label: '环境',
        width: 100,
        formatter: (api) => environmentLabel(api.environment)
      },
      {
        prop: 'method',
        label: '方法',
        width: 100,
        formatter: (api) => (
          <ElTag size="small" type={api.method === 'GET' ? 'primary' : 'warning'} effect="plain">
            {api.method}
          </ElTag>
        )
      },
      { prop: 'path', label: '路径', minWidth: 210, showOverflowTooltip: true },
      { prop: 'version', label: '版本', width: 88, formatter: (api) => `V${api.version}` },
      {
        prop: 'actions',
        label: '操作',
        width: 110,
        fixed: 'right',
        formatter: (api) => (
          <BusinessTableRowActions>
            <ElButton link type="primary" onClick={() => selectApi(api)}>
              选择接口
            </ElButton>
          </BusinessTableRowActions>
        )
      }
    ]
  }
  function environmentLabel(value: BffPublishedApi['environment']): string {
    return { development: '开发', staging: '预发布', production: '生产' }[value]
  }
  function selectApi(api: BffPublishedApi, openDrawer = true): void {
    selectedApi.value = api
    inputValues.value = Object.fromEntries(
      api.inputs.map((field) => [field.key, field.type === 'string' ? '' : null])
    )
    if (api.pagination) {
      inputValues.value[api.pagination.currentInputKey] = 1
      inputValues.value[api.pagination.sizeInputKey] = 20
    }
    gatewayResult.value = undefined
    pageRequested.value = false
    requestId.value = ''
    resultVersion.value = undefined
    runError.value = ''
    writeReviewNeeded.value = false
    resultTab.value = 'data'
    if (openDrawer)
      void invocationDrawerRef.value?.handleOpen(undefined, {
        title: '调用已发布接口',
        subtitle: '填写请求参数，核对返回数据与 JSON 响应',
        headerIcon: 'ri:play-circle-line'
      })
  }

  function openResponseGuide(): void {
    void responseGuideDrawerRef.value?.handleOpen(undefined, {
      title: '常见响应格式',
      subtitle: '对照不同服务的响应结构，了解统一响应字段',
      headerIcon: 'ri:book-open-line'
    })
  }

  const inputItems = computed<FormItem[]>(() =>
    (selectedApi.value?.inputs ?? []).map((field) => ({
      key: field.key,
      label: field.label || field.key,
      type: field.type === 'number' ? 'number' : field.type === 'boolean' ? 'select' : 'input',
      span: 12,
      props:
        field.type === 'boolean'
          ? {
              clearable: !field.required,
              placeholder: '选择是或否',
              options: booleanOptions
            }
          : field.type === 'number'
            ? { placeholder: `输入${field.label || field.key}` }
            : { placeholder: `输入${field.label || field.key}` },
      description: `${{ path: '路径', query: '查询', body: '请求体' }[field.location]}字段 · ${field.required ? '必填' : '选填'}`
    }))
  )
  const inputRules = computed<FormRules>(() =>
    Object.fromEntries(
      (selectedApi.value?.inputs ?? [])
        .filter((field) => field.required)
        .map((field) => [
          field.key,
          [{ required: true, message: `请填写${field.label || field.key}`, trigger: 'change' }]
        ])
    )
  )

  async function runSelected(): Promise<void> {
    const api = selectedApi.value
    if (
      !api ||
      running.value ||
      writeReviewNeeded.value ||
      (api.resultKind === 'page' && !api.pagination)
    )
      return
    if (api.inputs.length && !(await validateArtFormForSubmit(inputFormRef.value))) return
    if (api.method !== 'GET') {
      try {
        await confirmAction(
          `即将对「${api.name}」执行 ${api.method} 请求。若网络中断，请先按请求编号核对结果，避免重复提交。`,
          '确认调用已发布接口',
          { confirmButtonText: '确认调用' }
        )
      } catch {
        return
      }
    }
    runError.value = ''
    requestId.value = ''
    resultVersion.value = undefined
    gatewayResult.value = undefined
    resultTab.value = 'data'
    if (api.resultKind === 'page') {
      pageRequested.value = true
      pageRequestKey.value += 1
      await nextTick()
      await pageTableRef.value?.refreshData()
      return
    }
    running.value = true
    gatewayResult.value = undefined
    try {
      const response = await invokeBffInterface(api, { ...inputValues.value })
      gatewayResult.value = response
      requestId.value = response.requestId
      resultVersion.value = response.version
      writeReviewNeeded.value = false
    } catch (error) {
      runError.value = friendlyError(error, '接口调用失败，请核对输入和授权后重试')
      if (error instanceof BffBridgeError) requestId.value = error.requestId ?? ''
      if (api.method !== 'GET') writeReviewNeeded.value = true
    } finally {
      running.value = false
    }
  }
  async function loadPage(params: Record<string, unknown>) {
    const api = selectedApi.value
    if (!api || !api.pagination) return { records: [], total: 0, current: 1, size: 20 }
    const current = Math.max(1, Number(params.current) || 1)
    const size = Math.min(100, Math.max(1, Number(params.size) || 20))
    inputValues.value[api.pagination.currentInputKey] = current
    inputValues.value[api.pagination.sizeInputKey] = size
    running.value = true
    gatewayResult.value = undefined
    try {
      const response = await fetchBffPage(api, inputValues.value, { current, size })
      if (response.error) throw response.error
      if (selectedApi.value !== api) return { records: [], total: 0, current, size }
      gatewayResult.value = response.gatewayResult
      runError.value = ''
      if (response.requestId) requestId.value = response.requestId
      if (response.version) resultVersion.value = response.version
      return { records: response.data ?? [], total: response.total ?? 0, current, size }
    } catch (error) {
      runError.value = friendlyError(error, '分页调用失败，请核对输入和授权后重试')
      if (error instanceof BffBridgeError) requestId.value = error.requestId ?? ''
      throw error
    } finally {
      running.value = false
    }
  }
  function pageColumns(): ColumnOption<Record<string, BffScalar>>[] {
    return (selectedApi.value?.outputs ?? []).map((field) => ({
      prop: field.key,
      label: field.label || field.key,
      minWidth: 130,
      formatter: (row) => (row[field.key] === null ? '空值' : String(row[field.key] ?? '—'))
    }))
  }
  function isScalarResult(value: BffGatewayResult['data']): value is Record<string, BffScalar> {
    return !('records' in value && Array.isArray(value.records))
  }

  const scalarDescriptions = computed(() => {
    const value = gatewayResult.value?.data
    if (!value || !isScalarResult(value)) return []
    return (selectedApi.value?.outputs ?? []).map((field) => ({
      key: field.key,
      label: field.label || field.key,
      value: value[field.key] === null ? '空值' : String(value[field.key] ?? '—')
    }))
  })
</script>
