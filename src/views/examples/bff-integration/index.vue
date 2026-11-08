<template>
  <div class="bff-integration business-workspace-page art-full-height">
    <BusinessWorkspaceHeader
      eyebrow="PUBLISHED API ACCESS"
      title="BFF 接入中心"
      description="查看当前账号可调用的已发布接口，按声明字段填写参数并核对统一响应。"
      icon="ri:links-line"
      :tags="[
        { label: '沿用统一登录', type: 'success', effect: 'light' },
        { label: '仅显示已授权发布版本', type: 'primary', effect: 'plain' }
      ]"
      :metrics="workspaceMetrics"
    >
      <template #actions><BusinessTableWorkspaceActions :table="catalogTableRef" /></template>
    </BusinessWorkspaceHeader>

    <ElAlert v-if="catalogError" :title="catalogError" type="warning" :closable="false" show-icon />
    <ElAlert
      v-else-if="catalogLoaded && !allApis.length"
      title="当前账号暂无可调用的已发布接口。请先由 BFF 管理员完成应用授权和版本发布。"
      type="info"
      :closable="false"
      show-icon
    />

    <div
      class="bff-integration__workspace business-workspace-content flex min-w-0 flex-col gap-4 overflow-y-auto"
    >
      <div class="bff-integration__catalog-scope flex min-h-[420px] shrink-0 flex-col">
        <ArtTableQuery
          ref="catalogTableRef"
          v-model="catalogFilters"
          focusable
          focus-scope-selector=".bff-integration__catalog-scope"
          :api-fn="loadCatalog"
          :columns-factory="catalogColumns"
          :search-items="catalogSearchItems"
          :enable-cache="false"
          :search-bar-props="{ showExpand: false, span: 8 }"
          :table-header-props="{ layout: 'refresh,size' }"
          :table-props="{
            rowKey: 'interfaceId',
            emptyText: '没有符合条件的已发布接口',
            emptyDescription: '可清除筛选；如仍为空，请核对 BFF 应用授权。'
          }"
        />
      </div>

      <ArtSectionCard
        v-if="selectedApi"
        title="调用已发布接口"
        :subtitle="`${selectedApi.applicationName} · ${selectedApi.environment} · ${selectedApi.method} ${selectedApi.path}`"
        preserve-content-structure
      >
        <div class="grid min-w-0 gap-4">
          <div class="flex min-w-0 flex-wrap items-center gap-2">
            <ElTag type="primary" effect="plain">{{ selectedApi.name }}</ElTag>
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
            ref="inputFormRef"
            v-model="inputValues"
            :items="inputItems"
            :rules="inputRules"
            :span="12"
            :gutter="16"
            label-position="top"
          />
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
                writeReviewNeeded || (selectedApi.resultKind === 'page' && !selectedApi.pagination)
              "
              @click="runSelected"
            >
              <ArtSvgIcon icon="ri:play-circle-line" />{{
                selectedApi.resultKind === 'page' ? '查询分页记录' : '运行接口'
              }}
            </ElButton>
            <span class="text-xs text-g-700">调用使用当前统一登录身份与 BFF 应用权限。</span>
          </div>
          <ElAlert v-if="runError" :title="runError" type="error" :closable="false" show-icon />
        </div>
      </ArtSectionCard>

      <ArtSectionCard
        v-if="selectedApi && (gatewayResult || (pageRequested && !runError))"
        title="实际调用结果"
        subtitle="真实数据来自当前已发布接口；只显示发布合同声明的输出字段。"
        preserve-content-structure
      >
        <div class="grid min-w-0 gap-3">
          <div class="flex flex-wrap items-center gap-2 text-sm text-g-700">
            <ElTag v-if="requestId" type="success" effect="light">成功</ElTag>
            <span v-if="requestId"
              >请求编号 <code class="font-mono">{{ requestId }}</code></span
            >
            <span v-if="resultVersion">运行版本 V{{ resultVersion }}</span>
          </div>
          <ArtTableQuery
            v-if="selectedApi.resultKind === 'page'"
            :key="pageRequestKey"
            ref="pageTableRef"
            :api-fn="loadPage"
            :columns-factory="pageColumns"
            :immediate="false"
            :enable-cache="false"
            :table-header-props="{ layout: 'refresh,size' }"
            :table-props="{
              emptyText: '本页没有记录',
              emptyDescription: '可检查分页输入或调整页码后重试。'
            }"
          />
          <ArtDescriptions v-else :data="{}" :items="scalarDescriptions" :columns="2" border />
        </div>
      </ArtSectionCard>

      <ResponseGuide />
    </div>
  </div>
</template>

<script setup lang="tsx">
  import { ElButton, ElTag } from 'element-plus'
  import type { FormRules } from 'element-plus'
  import { fetchBffCatalog, fetchBffPage, invokeBffInterface, BffBridgeError } from '@/api/bff'
  import type { BffGatewayResult, BffPublishedApi, BffScalar } from '@/types/platform/bff'
  import type { ColumnOption } from '@/types'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type { ArtTableQueryExpose } from '@/components/core/tables/art-table-query/index.vue'
  import type ArtForm from '@/components/core/forms/art-form/index.vue'
  import type { FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtDescriptions from '@/components/core/base/art-descriptions/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import BusinessWorkspaceHeader, {
    type BusinessWorkspaceMetric
  } from '@/components/business/business-workspace-header/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import { uniq } from 'lodash-es'
  import ResponseGuide from './modules/response-guide.vue'

  const { confirmAction } = useArtFeedback()
  const booleanOptions = useDictionaryOptions('commonBoolean', (value) => value === 'true')
  const catalogTableRef = ref<ArtTableQueryExpose>()
  const pageTableRef = ref<ArtTableQueryExpose>()
  const inputFormRef = ref<InstanceType<typeof ArtForm>>()
  const catalogFilters = ref({ name: '', environment: '' })
  const allApis = shallowRef<BffPublishedApi[]>([])
  const catalogLoaded = ref(false)
  const catalogError = ref('')
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

  const workspaceMetrics = computed<BusinessWorkspaceMetric[]>(() => [
    {
      key: 'published',
      label: '可调用接口',
      value: allApis.value.length,
      description: '由当前账号授权范围决定',
      icon: 'ri:links-line',
      tone: 'primary',
      loading: !catalogLoaded.value
    },
    {
      key: 'selected',
      label: '当前选择',
      value: selectedApi.value ? `V${selectedApi.value.version}` : '—',
      description: selectedApi.value?.name ?? '从下方目录选择接口',
      icon: 'ri:cursor-line',
      tone: 'info',
      loading: false
    }
  ])
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
        } else if (current.version !== selectedApi.value.version) selectApi(current)
      }
      catalogLoaded.value = true
      catalogError.value = ''
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
      catalogLoaded.value = true
      allApis.value = []
      selectedApi.value = undefined
      gatewayResult.value = undefined
      pageRequested.value = false
      catalogError.value = friendlyError(error, '接口目录暂时无法加载，请刷新后重试')
      throw error
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
        label: '应用 / 环境',
        minWidth: 170,
        formatter: (api) => `${api.applicationName} · ${environmentLabel(api.environment)}`
      },
      { prop: 'method', label: '方法', width: 90 },
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
  function selectApi(api: BffPublishedApi): void {
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
    if (!(await validateArtFormForSubmit(inputFormRef.value))) return
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
    running.value = true
    try {
      const response = await fetchBffPage(api, inputValues.value, { current, size })
      if (response.error) throw response.error
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
