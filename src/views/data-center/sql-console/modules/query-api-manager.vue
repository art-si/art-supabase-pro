<template>
  <ArtDrawer
    ref="drawer"
    :size="1200"
    :loading="list.loading"
    loading-text="正在加载查询 API…"
    :show-confirm-button="false"
    :show-form-focus-button="false"
    cancel-text="返回 SQL 工作区"
  >
    <div class="flex min-w-0 flex-col gap-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <ElInput
          v-model="list.search"
          class="w-72! max-w-full"
          clearable
          placeholder="搜索名称、地址标识或说明"
          aria-label="搜索查询 API"
        >
          <template #prefix><ArtSvgIcon icon="ri:search-line" /></template>
        </ElInput>
        <div class="flex flex-wrap items-center gap-2">
          <ElButton :loading="list.loading" @click="loadSnapshot"
            ><ArtSvgIcon icon="ri:refresh-line" />刷新 API</ElButton
          >
          <ElButton v-if="canManage" type="primary" @click="editDefinition()"
            ><ArtSvgIcon icon="ri:add-line" />新建查询 API</ElButton
          >
        </div>
      </div>
      <QueryApiGuide
        v-if="list.snapshot"
        :key="identity"
        :definitions="list.snapshot.definitions"
        :can-manage="canManage"
        :disabled="list.loading || test.loading || guideBusy"
        @open-sample="openSample"
        @create-sample="createSample"
      />
      <ArtAsyncState
        :error="list.error"
        error-title="查询 API 加载失败"
        :empty="!list.snapshot?.definitions.length"
        empty-text="暂无可用查询 API"
        :empty-description="
          canManage
            ? '从当前 SQL 发布只读查询，或新建带参数的 API。'
            : '请联系平台管理员授权本租户可调用的查询 API。'
        "
        @retry="loadSnapshot"
      >
        <template v-if="list.snapshot">
          <ArtEmptyState
            v-if="!visibleDefinitions.length"
            title="未找到匹配 API"
            description="请更换搜索词，或清空搜索查看全部可用 API。"
            size="compact"
          >
            <ElButton @click="list.search = ''">清空搜索</ElButton>
          </ArtEmptyState>
          <div
            v-else
            class="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(14rem,18rem)_minmax(0,1fr)]"
          >
            <nav class="min-w-0" aria-label="查询 API 列表">
              <ElScrollbar max-height="440px">
                <div class="flex flex-col gap-2">
                  <button
                    v-for="definition in visibleDefinitions"
                    :key="definition.id"
                    type="button"
                    class="w-full rounded border px-3 py-3 text-left focus-visible:outline-2 focus-visible:outline-primary"
                    :class="
                      list.selectedId === definition.id
                        ? 'border-primary bg-primary/10'
                        : 'border-g-200 bg-g-100 hover:border-primary'
                    "
                    :aria-pressed="list.selectedId === definition.id"
                    @click="selectDefinition(definition.id)"
                  >
                    <span class="flex items-start justify-between gap-2"
                      ><span
                        class="min-w-0 truncate text-sm font-medium"
                        :title="definition.name"
                        >{{ definition.name }}</span
                      ><span
                        class="shrink-0 text-xs"
                        :class="definition.enabled ? 'text-success' : 'text-g-700'"
                        >{{ definition.enabled ? '已启用' : '已停用' }}</span
                      ></span
                    >
                    <span
                      class="mt-1 block truncate font-mono text-xs text-g-700"
                      :title="definition.slug"
                      >{{ definition.slug }}</span
                    >
                    <span class="mt-1 block text-xs text-g-700"
                      >{{ definition.parameters.length }} 个参数 · 最多
                      {{ definition.maxRows }} 行</span
                    >
                  </button>
                </div>
              </ElScrollbar>
            </nav>
            <section v-if="selected" ref="detailSection" class="min-w-0" aria-label="查询 API 详情">
              <div class="flex flex-wrap items-start justify-between gap-2">
                <div class="min-w-0 flex-1"
                  ><h3 class="m-0 break-words text-base font-semibold">{{ selected.name }}</h3
                  ><p class="mb-0 mt-1 text-xs leading-5 text-g-700">{{
                    selected.description || '按当前账号权限执行，仅返回此 API 所属租户的数据。'
                  }}</p></div
                >
                <ElButton v-if="canManage" size="small" @click="editDefinition(selected)"
                  >编辑与授权</ElButton
                >
              </div>
              <div class="my-3 flex items-start gap-2 rounded bg-g-100 p-3">
                <code class="min-w-0 flex-1 break-all text-xs leading-5">POST {{ apiUrl }}</code>
                <ArtIconButton
                  size="small"
                  icon="ri:file-copy-line"
                  label="复制查询 API 地址"
                  @click="copyUrl"
                />
              </div>
              <ElTabs v-model="test.activeTab">
                <ElTabPane label="调用测试" name="test">
                  <ElAlert
                    v-if="!selected.enabled"
                    title="此 API 已停用，启用后才能调用。"
                    type="info"
                    :closable="false"
                    show-icon
                  />
                  <p class="my-2 text-xs leading-5 text-g-700"
                    >按当前账号权限执行，仅返回此 API 所属租户的数据。最多
                    {{ selected.maxRows }} 行，超时 {{ selected.timeoutMs / 1000 }} 秒。</p
                  >
                  <ArtForm
                    ref="invokeForm"
                    v-model="test.values"
                    :items="invokeItems"
                    :rules="invokeRules"
                    :disabled="test.loading || !selected.enabled"
                    label-position="top"
                    class="px-0! pt-0!"
                  />
                  <p v-if="!selected.parameters.length" class="my-3 text-xs text-g-700"
                    >此 API 无需参数，可直接调用。</p
                  >
                  <div class="flex flex-wrap items-center gap-2">
                    <ElButton
                      v-if="test.loading && cancelTarget"
                      size="small"
                      type="warning"
                      :loading="test.cancelling"
                      :disabled="test.cancelRequested"
                      @click="requestCancel"
                      ><ArtSvgIcon icon="ri:stop-circle-line" />{{
                        test.cancelRequested ? '等待调用结束' : '取消调用'
                      }}</ElButton
                    >
                    <ElButton
                      v-else
                      type="primary"
                      size="small"
                      :disabled="!selected.enabled"
                      :loading="test.loading"
                      @click="invoke"
                      ><ArtSvgIcon icon="ri:play-circle-line" />调用 API</ElButton
                    >
                    <ElButton
                      size="small"
                      :disabled="test.loading || !selected.enabled || !selected.parameters.length"
                      @click="fillCurrentExample"
                      >填入示例参数</ElButton
                    >
                    <QueryApiParameterPresets
                      v-if="selected.parameters.length"
                      :key="presetRevision"
                      ref="presetPicker"
                      :presets="parameterPresets"
                      :parameter-signature="presetSignature"
                      :definition-version="selected.updatedAt"
                      :disabled="test.loading || list.loading || !selected.enabled"
                      :error="presetError"
                      :resettable="presetReadFailed"
                      @save="savePreset"
                      @apply="applyPreset"
                      @update="updatePreset"
                      @preview="previewPreset"
                      @forget="forgetPreset"
                      @refresh="presetStore.refresh"
                      @reset="resetPresets"
                    />
                    <ResultComparisonControls
                      :result="resultSnapshotInput"
                      :owner="resultOwnerKey"
                      :disabled="test.loading || !selected.enabled"
                    />
                    <ResultExportControls
                      :result="resultSnapshotInput"
                      :owner="resultOwnerKey"
                      :disabled="test.loading || !selected.enabled"
                    />
                  </div>
                  <div
                    v-if="test.loading || test.waitMs !== null || test.cancelled"
                    aria-label="API 调用状态"
                    class="my-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-5 text-g-700"
                  >
                    <span role="status">{{
                      test.loading
                        ? test.cancelling || test.cancelRequested
                          ? '正在取消调用…'
                          : test.waitMs === null
                            ? '正在校验参数…'
                            : '正在调用…'
                        : test.cancelled
                          ? '调用已取消'
                          : test.error
                            ? '调用失败'
                            : '调用完成'
                    }}</span>
                    <span v-if="test.loading && test.waitMs !== null" aria-live="off"
                      >已等待 {{ Math.floor(test.waitMs / 1000) }} 秒</span
                    >
                    <span v-if="test.timeoutMs !== null" aria-live="off"
                      >本次时限 {{ formatDurationMs(test.timeoutMs) }}</span
                    >
                    <span
                      v-if="!test.loading && test.waitMs !== null"
                      aria-live="off"
                      title="包含身份验证、网络、接口处理与客户端整理，不等同于数据库执行耗时。"
                      >浏览器总等待 {{ formatDurationMs(test.waitMs) }}</span
                    >
                  </div>
                  <ElAlert
                    v-if="test.cancelError"
                    class="mt-3"
                    :title="test.cancelError"
                    type="warning"
                    :closable="false"
                    show-icon
                  />
                  <p
                    v-if="test.exampleHint"
                    class="my-2 text-xs leading-5 text-g-700"
                    role="status"
                    >{{ test.exampleHint }}</p
                  >
                  <ElAlert
                    v-if="test.error"
                    class="mt-3"
                    :title="test.error"
                    type="error"
                    :closable="false"
                    show-icon
                  />
                  <template v-if="test.result">
                    <p class="my-3 text-xs text-g-700" role="status"
                      >返回 {{ test.result.rows.length }} 行 · {{ test.result.durationMs }} ms{{
                        test.result.truncated ? ' · 已达到返回上限' : ''
                      }}</p
                    >
                    <div class="h-[480px] min-w-0"
                      ><ResultTable
                        ref="resultTable"
                        :data="test.result.rows"
                        :owner="resultOwnerKey"
                        :columns="test.result.columns"
                        :loading="test.loading"
                        :truncated="test.result.truncated"
                    /></div>
                  </template>
                </ElTabPane>
                <ElTabPane label="接入说明" name="integration">
                  <QueryApiOpenApiControls
                    ref="openApiControls"
                    :definition="selected"
                    :url="apiUrl"
                    :owner="identity"
                    :disabled="test.loading || list.loading"
                  />
                  <p class="my-2 text-xs leading-5 text-g-700"
                    >使用调用账号的有效访问令牌和项目公开 Key，分别替换 YOUR_ACCESS_TOKEN 与
                    YOUR_PUBLISHABLE_KEY；不要使用服务角色密钥。示例不包含当前登录凭据。授权或启用状态变化后，服务端会重新校验。</p
                  >
                  <PlanCodePreview
                    ref="requestCodePreview"
                    title="请求参数示例"
                    language="json"
                    :code="examples.body"
                    expanded
                    max-height="220px"
                  />
                  <div class="mt-3"
                    ><PlanCodePreview
                      ref="curlCodePreview"
                      title="cURL 调用示例"
                      language="plaintext"
                      :code="examples.curl"
                      expanded
                      max-height="280px"
                  /></div>
                  <div class="mt-3"
                    ><PlanCodePreview
                      ref="javascriptCodePreview"
                      title="JavaScript 调用示例"
                      language="plaintext"
                      :code="examples.javascript"
                      max-height="320px"
                  /></div>
                </ElTabPane>
                <ElTabPane v-if="canManage" label="SQL 定义" name="sql">
                  <PlanCodePreview
                    ref="definitionCodePreview"
                    title="已发布的参数化 SQL"
                    language="sql"
                    :code="selected.sql"
                    expanded
                  />
                  <p class="text-xs leading-5 text-g-700"
                    >参数使用 :name 绑定为值，不支持动态表名或字段名。调用者不能上传或改写 SQL。</p
                  >
                </ElTabPane>
              </ElTabs>
            </section>
          </div>
        </template>
      </ArtAsyncState>
    </div>
  </ArtDrawer>
  <ArtDialog ref="editorDialog" :show-form-focus-button="false">
    <ArtForm
      ref="editorForm"
      v-model="form"
      :items="editItems"
      :rules="editRules"
      label-position="top"
    >
      <template #allowedUserIds
        ><ArtUserSelect
          v-model="form.allowedUserIds"
          multiple
          :options="userOptions"
          placeholder="默认仅平台超级管理员可调用"
      /></template>
      <template #parameters>
        <div class="w-full min-w-0">
          <div class="mb-2 flex flex-wrap items-center justify-between gap-2"
            ><span class="text-xs leading-5 text-g-700"
              >点击单元格编辑。参数名与 SQL 中 :name 一一对应。</span
            ><ElButton size="small" :disabled="parameterCount >= 20" @click="addParameter"
              >添加参数</ElButton
            ></div
          >
          <ArtTable
            ref="parameterTable"
            :data="form.parameters"
            :columns="parameterColumns"
            :edit-config="{ enabled: true, trigger: 'click', mode: 'row' }"
            :show-table-header="false"
            :max-height="300"
            empty-text="无参数，调用时传空 params 对象"
            border
            @edit-change="syncParameterCount"
          />
        </div>
      </template>
    </ArtForm>
    <p class="m-0 text-xs leading-5 text-g-700"
      >发布后，只有所属租户内的授权账号可以调用。服务端按调用者权限和 API
      租户执行只读事务，强制返回上限和超时。停用可立即阻止后续调用。</p
    >
  </ArtDialog>
  <QueryApiPresetDialog ref="presetDialog" />
  <CellContentView ref="presetPreview" />
</template>

<script setup lang="ts">
  import {
    computed,
    h,
    nextTick,
    onActivated,
    onBeforeUnmount,
    onDeactivated,
    reactive,
    ref,
    shallowRef,
    watch
  } from 'vue'
  import { useIntervalFn, useTimeoutPoll } from '@vueuse/core'
  import { ElButton, ElMessage } from 'element-plus'
  import { cloneDeep, uniq } from 'lodash-es'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtUserSelect from '@/components/core/forms/art-user-select/index.vue'
  import ArtTable, { type ArtTableExpose } from '@/components/core/tables/art-table/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import type { ColumnOption } from '@/types'
  import type {
    SqlQueryApiDefinition,
    SqlQueryApiInput,
    SqlQueryApiParameter,
    SqlQueryApiResult,
    SqlQueryApiSnapshot
  } from '@/types/sql-query-api'
  import {
    fetchSqlQueryApis,
    getSqlQueryApiUrl,
    invokeSqlQueryApi,
    cancelSqlQueryApi,
    saveSqlQueryApi
  } from '@/api/sql-query-api'
  import { fetchTenantList } from '@/api/system-manage/tenant'
  import { useUserStore } from '@/store/modules/user'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
  import { formatDurationMs } from '@/utils/ui/format'
  import { copyTextToClipboard } from '@/utils/file/clipboard'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import ResultTable from './result-table.vue'
  import ResultComparisonControls from './result-comparison-controls.vue'
  import ResultExportControls from './result-export-controls.vue'
  import type { SqlResultSnapshotInput } from './result-compare'
  import PlanCodePreview, { type PlanCodePreviewExpose } from './plan-code-preview.vue'
  import QueryApiGuide from './query-api-guide.vue'
  import QueryApiOpenApiControls, {
    type QueryApiOpenApiControlsExpose
  } from './query-api-openapi-controls.vue'
  import QueryApiParameterPresets, {
    type QueryApiParameterPresetsExpose
  } from './query-api-parameter-presets.vue'
  import QueryApiPresetDialog, {
    type QueryApiPresetDialogExpose
  } from './query-api-preset-dialog.vue'
  import CellContentView, { type CellContentViewExpose } from './cell-content-view.vue'
  import {
    normalizeQueryApiPresetValues,
    SqlQueryApiPresetError,
    type SqlQueryApiParameterPreset
  } from './query-api-parameter-presets'
  import { useQueryApiParameterPresets } from './use-query-api-parameter-presets'
  import {
    sqlQueryApiExampleValues,
    sqlQueryApiExamples,
    sqlQueryApiParameters
  } from './query-api-ui'
  import {
    getSqlQueryApiSample,
    sqlQueryApiSamples,
    type SqlQueryApiSample
  } from './query-api-samples'

  const drawer = ref<ArtDrawerExpose>()
  const editorDialog = ref<ArtDialogExpose>()
  const editorForm = ref<InstanceType<typeof ArtForm>>()
  const invokeForm = ref<InstanceType<typeof ArtForm>>()
  const parameterTable = ref<ArtTableExpose<SqlQueryApiParameter>>()
  const resultTable = ref<InstanceType<typeof ResultTable>>()
  const detailSection = ref<HTMLElement>()
  const presetPicker = ref<QueryApiParameterPresetsExpose>()
  const presetDialog = ref<QueryApiPresetDialogExpose>()
  const presetPreview = ref<CellContentViewExpose>()
  const openApiControls = ref<QueryApiOpenApiControlsExpose>()
  const requestCodePreview = ref<PlanCodePreviewExpose>()
  const curlCodePreview = ref<PlanCodePreviewExpose>()
  const javascriptCodePreview = ref<PlanCodePreviewExpose>()
  const definitionCodePreview = ref<PlanCodePreviewExpose>()
  const feedback = useArtFeedback()
  const guideBusy = ref(false)
  const user = useUserStore()
  const tenant = useTenantScopeStore()
  const identity = computed(() =>
    JSON.stringify([user.getUserInfo.userId || '', tenant.effectiveTenantId, user.isPlatformSuper])
  )
  const list = reactive<{
    loading: boolean
    error: string
    search: string
    selectedId: string
    snapshot: SqlQueryApiSnapshot | null
  }>({ loading: false, error: '', search: '', selectedId: '', snapshot: null })
  const test = reactive<{
    loading: boolean
    activeTab: string
    values: Record<string, unknown>
    error: string
    exampleHint: string
    result: SqlQueryApiResult | null
    cancelling: boolean
    cancelRequested: boolean
    cancelled: boolean
    cancelError: string
    waitMs: number | null
    timeoutMs: number | null
  }>({
    loading: false,
    activeTab: 'test',
    values: {},
    error: '',
    exampleHint: '',
    result: null,
    cancelling: false,
    cancelRequested: false,
    cancelled: false,
    cancelError: '',
    waitMs: null,
    timeoutMs: null
  })
  const canManage = computed(() => Boolean(user.isPlatformSuper && list.snapshot?.canManage))
  const visibleDefinitions = computed(() => {
    const search = list.search.trim().toLowerCase()
    return (list.snapshot?.definitions || []).filter(
      (definition) =>
        !search ||
        `${definition.name} ${definition.slug} ${definition.description}`
          .toLowerCase()
          .includes(search)
    )
  })
  const selected = computed(() =>
    list.snapshot?.definitions.find((definition) => definition.id === list.selectedId)
  )
  const presetStore = useQueryApiParameterPresets({
    scope: () => (user.getUserInfo.userId ? identity.value : null),
    definition: selected
  })
  const {
    presets: parameterPresets,
    error: presetError,
    readFailed: presetReadFailed,
    signature: presetSignature,
    revision: presetRevision
  } = presetStore
  const resultOwnerKey = computed(() =>
    JSON.stringify([selected.value?.id, selected.value?.updatedAt, selected.value?.enabled])
  )
  const resultSnapshotInput = computed<SqlResultSnapshotInput | null>(() =>
    test.result
      ? {
          rows: test.result.rows,
          columns: test.result.columns,
          label: selected.value?.name || '查询 API',
          query: canManage.value ? selected.value?.sql || '' : '',
          truncated: test.result.truncated
        }
      : null
  )
  const apiUrl = computed(() => (selected.value ? getSqlQueryApiUrl(selected.value.slug) : ''))
  const examples = computed(() =>
    selected.value
      ? sqlQueryApiExamples(selected.value, apiUrl.value)
      : { body: '', curl: '', javascript: '' }
  )
  let generation = 0
  let invocation = 0
  let editGeneration = 0
  let selectionAction = 0
  let guideAction = 0
  let drawerSession = 0
  let alive = true
  let active = true
  let invokeAction = 0
  let callStartedAt: number | null = null
  let callIsCurrent: (() => boolean) | null = null
  interface CancelTarget {
    requestId: string
    definitionId: string
    isCurrent: () => boolean
    pending: boolean
  }
  const cancelTarget = shallowRef<CancelTarget | null>(null)
  const sampleCallWait = (): void => {
    if (callStartedAt !== null && callIsCurrent?.())
      test.waitMs = Math.max(0, performance.now() - callStartedAt)
  }
  const { pause: pauseCallClock, resume: resumeCallClock } = useIntervalFn(sampleCallWait, 1000, {
    immediate: false
  })
  const { pause: pauseCancelPoll, resume: resumeCancelPoll } = useTimeoutPoll(
    async () => {
      const target = cancelTarget.value
      if (!target || !target.isCurrent() || !test.loading || !test.cancelling) {
        pauseCancelPoll()
        return
      }
      if (target.pending) return
      target.pending = true
      try {
        const response = await cancelSqlQueryApi(target.requestId, target.definitionId)
        if (cancelTarget.value !== target || !target.isCurrent() || !test.loading) return
        if (response.state !== 'not_running') {
          test.cancelRequested = true
          test.cancelling = false
          pauseCancelPoll()
        }
      } catch (cause) {
        if (cancelTarget.value === target && target.isCurrent() && test.loading) {
          test.cancelling = false
          test.cancelError = getFriendlySupabaseErrorMessage(
            cause,
            '取消调用失败，请重试或等待调用结束'
          )
          pauseCancelPoll()
        }
      } finally {
        target.pending = false
      }
    },
    500,
    { immediate: false }
  )
  const resetCallControls = (): void => {
    pauseCallClock()
    pauseCancelPoll()
    cancelTarget.value = null
    callStartedAt = null
    callIsCurrent = null
  }
  const requestCancel = (): void => {
    if (
      !test.loading ||
      !cancelTarget.value?.isCurrent() ||
      test.cancelling ||
      test.cancelRequested
    )
      return
    test.cancelError = ''
    test.cancelling = true
    resumeCancelPoll()
  }
  const friendly = (cause: unknown) =>
    getFriendlySupabaseErrorMessage(cause, '查询 API 操作失败，请稍后重试')
  const resetCallOverlays = (): void => {
    requestCodePreview.value?.invalidateCopy()
    curlCodePreview.value?.invalidateCopy()
    javascriptCodePreview.value?.invalidateCopy()
    definitionCodePreview.value?.invalidateCopy()
    presetDialog.value?.reset()
    presetPreview.value?.reset()
    presetPicker.value?.close()
    openApiControls.value?.reset()
  }
  const presetAction = () => {
    if (
      !alive ||
      !active ||
      !user.getUserInfo.userId ||
      list.loading ||
      test.loading ||
      !selected.value?.enabled ||
      !selected.value.parameters.length
    )
      return null
    const context = presetStore.capture()
    const version = generation
    const session = drawerSession
    return {
      context,
      current: () =>
        alive &&
        active &&
        version === generation &&
        session === drawerSession &&
        !list.loading &&
        !test.loading &&
        Boolean(selected.value?.enabled) &&
        presetStore.current(context)
    }
  }
  const presetFailure = (cause: unknown): void => {
    ElMessage.warning(
      cause instanceof SqlQueryApiPresetError ? cause.message : '参数方案操作失败，请重新读取后重试'
    )
  }
  const savePreset = async (): Promise<void> => {
    const action = presetAction()
    if (!action) return
    try {
      // Snapshot explicit fields when opening the dialog; later input changes do not alter this save.
      const values = normalizeQueryApiPresetValues(
        action.context.definition.parameters,
        test.values
      )
      await presetDialog.value?.open({
        onSave: (name) => {
          if (!action.current()) return false
          presetStore.save(name, values, action.context)
          if (!action.current()) return false
          ElMessage.success('参数方案已保存在本机')
          return true
        }
      })
    } catch (cause) {
      if (action.current()) presetFailure(cause)
    }
  }
  const applyPreset = (preset: SqlQueryApiParameterPreset): void => {
    const action = presetAction()
    if (!action) return
    try {
      const values = presetStore.apply(preset, action.context)
      if (!action.current()) return
      test.values = values
      test.error = ''
      test.activeTab = 'test'
      test.exampleHint = `已填入方案“${preset.name}”，尚未调用；请核对参数后点击“调用 API”。${preset.definitionVersion !== action.context.definition.updatedAt ? 'API 已更新，请检查参数。' : ''}${test.result ? '已有结果不会自动更新。' : ''}`
      invokeForm.value?.clearValidate()
    } catch (cause) {
      if (action.current()) presetFailure(cause)
    }
  }
  const updatePreset = (preset: SqlQueryApiParameterPreset): void => {
    const action = presetAction()
    if (!action) return
    try {
      const values = normalizeQueryApiPresetValues(
        action.context.definition.parameters,
        test.values
      )
      presetStore.update(preset, values, action.context)
      if (action.current()) ElMessage.success('已用当前参数更新本机方案')
    } catch (cause) {
      if (action.current()) presetFailure(cause)
    }
  }
  const forgetPreset = (preset: SqlQueryApiParameterPreset): void => {
    const action = presetAction()
    if (!action) return
    try {
      presetStore.forget(preset, action.context)
      if (action.current()) ElMessage.success('已取消保存此参数方案')
    } catch (cause) {
      if (action.current()) presetFailure(cause)
    }
  }
  const previewPreset = async (preset: SqlQueryApiParameterPreset): Promise<void> => {
    const action = presetAction()
    if (!action) return
    try {
      const saved = presetStore.inspect(preset, action.context)
      await presetPreview.value?.handleOpen({
        content: JSON.stringify(saved.values, null, 2),
        columnName: saved.name,
        preserveRaw: true,
        title: '参数方案详情',
        subtitle: '仅保存在本机 · 查看不会调用 API'
      })
    } catch (cause) {
      if (action.current()) presetFailure(cause)
    }
  }
  const resetPresets = async (): Promise<void> => {
    const action = presetAction()
    if (!action || !presetReadFailed.value) return
    let raw: string
    try {
      raw = presetStore.resetSource(action.context)
    } catch (cause) {
      if (action.current()) presetFailure(cause)
      return
    }
    try {
      await feedback.confirm(
        '仅重置此浏览器中当前账号、当前租户、此 API 的参数方案。当前输入参数会保留。',
        {
          title: '重置本机参数方案',
          confirmButtonText: '重置本机方案'
        }
      )
    } catch (cause) {
      if (cause !== 'cancel' && cause !== 'close' && action.current()) presetFailure(cause)
      return
    }
    if (!action.current()) return
    try {
      presetStore.reset(raw, action.context)
      if (action.current()) {
        presetPicker.value?.close()
        ElMessage.success('此 API 的本机参数方案已重置')
      }
    } catch (cause) {
      if (action.current()) presetFailure(cause)
    }
  }
  watch([presetRevision, () => test.loading || list.loading], resetCallOverlays, {
    flush: 'sync'
  })
  const clearTest = () => {
    invocation++
    invokeAction++
    resetCallControls()
    resetCallOverlays()
    Object.assign(test, {
      loading: false,
      activeTab: 'test',
      values: {},
      error: '',
      exampleHint: '',
      result: null,
      cancelling: false,
      cancelRequested: false,
      cancelled: false,
      cancelError: '',
      waitMs: null,
      timeoutMs: null
    })
  }
  const selectDefinition = async (id: string): Promise<boolean> => {
    if (!alive || !list.snapshot?.definitions.some((definition) => definition.id === id))
      return false
    if (id === list.selectedId) return true
    const owner = identity.value
    const version = generation
    const snapshot = list.snapshot
    const action = ++selectionAction
    if (!((await resultTable.value?.confirmLeave()) ?? true)) return false
    if (
      !alive ||
      owner !== identity.value ||
      version !== generation ||
      snapshot !== list.snapshot ||
      action !== selectionAction
    )
      return false
    list.selectedId = id
    clearTest()
    return true
  }
  const loadSnapshot = async () => {
    if (!alive || list.loading) return false
    const owner = identity.value
    const version = generation
    if (!((await resultTable.value?.confirmLeave()) ?? true)) return false
    if (!alive || owner !== identity.value || version !== generation) return false
    const current = ++generation
    clearTest()
    list.loading = true
    list.error = ''
    try {
      const snapshot = await fetchSqlQueryApis()
      if (current !== generation) return false
      list.snapshot = snapshot
      if (!snapshot.definitions.some((definition) => definition.id === list.selectedId))
        list.selectedId = snapshot.definitions[0]?.id || ''
      clearTest()
      return true
    } catch (cause) {
      if (current === generation) {
        list.snapshot = null
        list.error = friendly(cause)
        clearTest()
      }
      return false
    } finally {
      if (current === generation) list.loading = false
    }
  }
  const invokeItems = computed<FormItem[]>(() =>
    (selected.value?.parameters || []).map((parameter) => ({
      key: parameter.name,
      label: `${parameter.name}${parameter.required ? '（必填）' : '（可选）'}`,
      span: 12,
      type: parameter.type === 'boolean' ? 'select' : parameter.type === 'date' ? 'date' : 'input',
      placeholder:
        parameter.type === 'number'
          ? '保留十进制文本，不自动舍入'
          : parameter.type === 'uuid'
            ? '输入 UUID'
            : `输入 ${parameter.name}`,
      options:
        parameter.type === 'boolean'
          ? [
              { label: 'true', value: true },
              { label: 'false', value: false }
            ]
          : undefined,
      props: {
        clearable: !parameter.required,
        'aria-label': `API 参数 ${parameter.name}`,
        ...(parameter.type === 'date' ? { type: 'date', valueFormat: 'YYYY-MM-DD' } : {})
      }
    }))
  )
  const invokeRules = computed(() =>
    Object.fromEntries(
      (selected.value?.parameters || [])
        .filter((parameter) => parameter.required)
        .map((parameter) => [
          parameter.name,
          [{ required: true, message: `请填写参数 ${parameter.name}` }]
        ])
    )
  )
  const invoke = async () => {
    const definition = selected.value
    if (!alive || !active || !definition?.enabled || test.loading || list.loading) return
    const owner = identity.value
    const version = generation
    const session = drawerSession
    const action = ++invokeAction
    if (!((await resultTable.value?.confirmLeave()) ?? true)) return
    if (
      !alive ||
      !active ||
      action !== invokeAction ||
      session !== drawerSession ||
      owner !== identity.value ||
      version !== generation ||
      selected.value !== definition
    )
      return
    const current = ++invocation
    const isCurrent = () =>
      alive &&
      active &&
      current === invocation &&
      owner === identity.value &&
      version === generation &&
      session === drawerSession &&
      selected.value === definition
    resetCallControls()
    test.loading = true
    test.error = ''
    test.exampleHint = ''
    test.result = null
    test.cancelled = false
    test.cancelling = false
    test.cancelRequested = false
    test.cancelError = ''
    test.waitMs = null
    test.timeoutMs = null
    try {
      await invokeForm.value?.validate()
      if (!isCurrent()) return
      const params = sqlQueryApiParameters(definition.parameters, test.values)
      const requestId = crypto.randomUUID()
      cancelTarget.value = { requestId, definitionId: definition.id, isCurrent, pending: false }
      callIsCurrent = isCurrent
      callStartedAt = performance.now()
      test.waitMs = 0
      test.timeoutMs = definition.timeoutMs
      resumeCallClock()
      const result = await invokeSqlQueryApi(definition.slug, params, requestId)
      if (!isCurrent()) return
      if (result.status === 'cancelled') {
        test.cancelled = true
        return
      }
      test.result = result
    } catch (cause) {
      if (isCurrent()) {
        test.result = null
        test.error = cause instanceof Error ? friendly(cause) : '请检查参数后重试'
      }
    } finally {
      if (isCurrent()) {
        sampleCallWait()
        resetCallControls()
        test.loading = false
        test.cancelling = false
        test.cancelRequested = false
        test.cancelError = ''
      }
    }
  }
  const fillExampleValues = (definition: SqlQueryApiDefinition): void => {
    test.values = sqlQueryApiExampleValues(definition)
    test.error = ''
    test.activeTab = 'test'
    test.exampleHint = `已填入示例参数，尚未调用；请点击“调用 API”运行。${test.result ? '已有结果不会自动更新。' : ''}`
    invokeForm.value?.clearValidate()
  }
  const fillCurrentExample = (): void => {
    const definition = selected.value
    if (!alive || test.loading || !definition?.enabled || !definition.parameters.length) return
    fillExampleValues(definition)
  }
  const openSample = async (slug: string): Promise<void> => {
    if (!alive || guideBusy.value || list.loading || test.loading) return
    const matches =
      list.snapshot?.definitions.filter(
        (definition) => getSqlQueryApiSample(definition)?.slug === slug
      ) || []
    const definition = matches.find((item) => item.enabled) ?? matches[0]
    if (!definition) return
    const owner = identity.value
    const version = generation
    const action = ++guideAction
    guideBusy.value = true
    try {
      if (!(await selectDefinition(definition.id))) return
      await nextTick()
      if (
        !alive ||
        owner !== identity.value ||
        version !== generation ||
        action !== guideAction ||
        selected.value !== definition
      )
        return
      list.search = ''
      fillExampleValues(definition)
      await nextTick()
      if (
        alive &&
        owner === identity.value &&
        version === generation &&
        action === guideAction &&
        selected.value === definition
      )
        detailSection.value?.scrollIntoView({ block: 'start', behavior: 'auto' })
    } finally {
      if (action === guideAction) guideBusy.value = false
    }
  }
  const createSample = async (slug: string): Promise<void> => {
    if (!alive || !canManage.value || guideBusy.value || list.loading || test.loading) return
    const sample = sqlQueryApiSamples.find((item) => item.slug === slug)
    if (!sample) return
    const action = ++guideAction
    guideBusy.value = true
    try {
      await editDefinition(undefined, '', sample)
    } finally {
      if (action === guideAction) guideBusy.value = false
    }
  }
  const emptyForm = (sql = ''): SqlQueryApiInput => ({
    id: undefined,
    updatedAt: undefined,
    slug: '',
    name: '',
    description: '',
    sql,
    tenantId: tenant.effectiveTenantId || user.getUserInfo.tenantId || '',
    allowedUserIds: [],
    parameters: [],
    maxRows: 200,
    timeoutMs: 10000,
    enabled: true
  })
  const form = ref<SqlQueryApiInput>(emptyForm())
  const parameterCount = ref(0)
  const syncParameterCount = () => {
    parameterCount.value = parameterTable.value?.getTableData().length || 0
  }
  const addParameter = () => {
    if (parameterCount.value >= 20) return
    const names = parameterTable.value?.getTableData().map((parameter) => parameter.name) || []
    const name =
      Array.from({ length: 21 }, (_, index) => `parameter_${index + 1}`).find(
        (candidate) => !names.includes(candidate)
      ) || 'parameter'
    parameterTable.value?.insertAt({ name, type: 'string', required: true }, -1)
    syncParameterCount()
  }
  const removeParameter = (row: SqlQueryApiParameter) => {
    parameterTable.value?.remove(row)
    syncParameterCount()
  }
  const parameterColumns: ColumnOption<SqlQueryApiParameter>[] = [
    {
      prop: 'name',
      label: '参数名',
      minWidth: 150,
      required: true,
      rules: {
        validator: ({ value }) =>
          (typeof value === 'string' && /^[A-Za-z][A-Za-z\d_]{0,63}$/.test(value)) ||
          '参数名以字母开头，仅支持字母、数字和下划线'
      },
      editRender: { name: 'input', maxLength: 64 }
    },
    {
      prop: 'type',
      label: '类型',
      minWidth: 130,
      editRender: {
        name: 'select',
        options: ['string', 'number', 'boolean', 'date', 'uuid'].map((type) => ({
          label: type,
          value: type
        }))
      }
    },
    {
      prop: 'required',
      label: '是否必填',
      width: 110,
      formatter: (row) => (row.required ? '必填' : '可选'),
      editRender: { name: 'switch' }
    },
    {
      label: '操作',
      width: 72,
      formatter: (row) =>
        h(
          ElButton,
          {
            size: 'small',
            text: true,
            type: 'danger',
            'aria-label': `移除参数 ${row.name}`,
            onClick: () => removeParameter(row)
          },
          () => '移除'
        )
    }
  ]
  const userOptions = computed(() =>
    (list.snapshot?.users || [])
      .filter((account) => account.tenantId === form.value.tenantId)
      .map((account) => ({ label: account.name, value: account.id }))
  )
  const editItems = computed<FormItem[]>(() => [
    {
      key: 'name',
      label: 'API 名称',
      type: 'input',
      span: 12,
      props: { maxlength: 80, 'aria-label': '查询 API 名称' }
    },
    {
      key: 'slug',
      label: '地址标识',
      type: 'input',
      span: 12,
      placeholder: '例如 order-summary',
      description: form.value.id
        ? '已发布地址保持稳定，不能修改。'
        : '小写字母开头，3–64 位小写字母、数字或短横线。',
      props: { maxlength: 64, disabled: Boolean(form.value.id), 'aria-label': '查询 API 地址标识' }
    },
    {
      key: 'description',
      label: '用途说明',
      type: 'input',
      span: 24,
      props: { maxlength: 500, 'aria-label': '查询 API 用途说明' }
    },
    {
      key: 'sql',
      label: '参数化 SQL',
      type: 'input',
      span: 24,
      description:
        '仅支持单条 SELECT / WITH 只读查询。使用 :name 绑定值；不要给参数加引号，参数不能用于表名或字段名。',
      props: {
        type: 'textarea',
        autosize: { minRows: 5, maxRows: 10 },
        maxlength: 100000,
        'aria-label': '查询 API SQL'
      }
    },
    { key: 'parameters', label: '参数定义', span: 24 },
    {
      key: 'tenantId',
      label: '所属租户',
      type: 'select',
      span: 12,
      api: () => fetchTenantList({ status: '1', from: 0, to: 999 }),
      resultField: 'data',
      labelField: 'tenantName',
      valueField: 'id',
      props: {
        disabled: Boolean(form.value.id) || Boolean(tenant.effectiveTenantId),
        'aria-label': '查询 API 所属租户'
      }
    },
    {
      key: 'enabled',
      label: '启用 API',
      type: 'switch',
      span: 12,
      props: { 'aria-label': '启用查询 API' }
    },
    {
      key: 'maxRows',
      label: '最多返回行数',
      type: 'number',
      span: 12,
      props: {
        min: 1,
        max: 1000,
        precision: 0,
        controlsPosition: 'right',
        'aria-label': '查询 API 返回行数'
      }
    },
    {
      key: 'timeoutMs',
      label: '查询超时（毫秒）',
      type: 'number',
      span: 12,
      props: {
        min: 1000,
        max: 30000,
        step: 1000,
        precision: 0,
        controlsPosition: 'right',
        'aria-label': '查询 API 超时毫秒'
      }
    },
    { key: 'allowedUserIds', label: '授权调用账号', span: 24 }
  ])
  const editRules = {
    name: [{ required: true, message: '请输入 API 名称' }],
    slug: [
      { required: true, message: '请输入地址标识' },
      { pattern: /^[a-z][a-z0-9-]{2,63}$/, message: '地址标识须为 3–64 位小写字母、数字或短横线' }
    ],
    sql: [{ required: true, message: '请输入只读查询 SQL' }],
    tenantId: [{ required: true, message: '请选择所属租户' }]
  }
  const editDefinition = async (
    definition?: SqlQueryApiDefinition,
    sql = '',
    sample?: SqlQueryApiSample
  ) => {
    if (!alive || !canManage.value) return
    const owner = identity.value
    const version = generation
    if (!((await resultTable.value?.confirmLeave()) ?? true)) return
    if (!alive || owner !== identity.value || version !== generation || !canManage.value) return
    form.value = definition
      ? cloneDeep(definition)
      : {
          ...emptyForm(sample?.sql ?? sql),
          ...(sample
            ? {
                name: sample.name,
                slug: `${sample.slug}-${crypto.randomUUID().replaceAll('-', '').slice(0, 8)}`,
                description: sample.description,
                parameters: cloneDeep(sample.parameters),
                maxRows: sample.maxRows,
                timeoutMs: sample.timeoutMs
              }
            : {})
        }
    parameterCount.value = form.value.parameters.length
    const editor = ++editGeneration
    await editorDialog.value?.handleOpen(undefined, {
      title: definition ? '编辑查询 API' : '发布查询 API',
      subtitle: '固定 SQL、类型化参数、租户与账号授权',
      width: 880,
      confirmText: definition ? '保存 API' : '发布 API',
      onConfirm: async () => {
        if (!alive || owner !== identity.value || editor !== editGeneration || !canManage.value)
          return false
        try {
          await editorForm.value?.validate()
          const validation = await parameterTable.value?.validate()
          if (validation?.valid === false) return false
          if (owner !== identity.value || editor !== editGeneration) return false
          const parameters = parameterTable.value?.getTableData() || []
          if (uniq(parameters.map((parameter) => parameter.name)).length !== parameters.length)
            throw new Error('参数名不能重复')
          const input = {
            ...form.value,
            name: form.value.name.trim(),
            slug: form.value.slug.trim(),
            description: form.value.description.trim(),
            sql: form.value.sql.trim(),
            parameters
          }
          const saved = await saveSqlQueryApi(input)
          if (owner !== identity.value || editor !== editGeneration) return false
          if (list.snapshot)
            list.snapshot = {
              ...list.snapshot,
              definitions: [
                saved,
                ...list.snapshot.definitions.filter((item) => item.id !== saved.id)
              ]
            }
          list.selectedId = saved.id
          list.search = ''
          clearTest()
          ElMessage.success(definition ? '查询 API 已保存' : '查询 API 已发布')
          return true
        } catch (cause) {
          if (
            alive &&
            owner === identity.value &&
            editor === editGeneration &&
            cause instanceof Error
          )
            ElMessage.warning(friendly(cause))
          return false
        }
      },
      onClose: () => {
        editGeneration++
      }
    })
  }
  const copyUrl = async () => {
    try {
      await copyTextToClipboard(apiUrl.value)
      ElMessage.success('查询 API 地址已复制')
    } catch {
      ElMessage.warning('复制失败，请手动复制地址')
    }
  }
  watch(
    () => form.value.tenantId,
    () => {
      form.value.allowedUserIds = form.value.allowedUserIds.filter((id) =>
        userOptions.value.some((account) => account.value === id)
      )
    }
  )
  watch(
    identity,
    () => {
      generation++
      editGeneration++
      selectionAction++
      guideAction++
      drawerSession++
      guideBusy.value = false
      Object.assign(list, { loading: false, error: '', snapshot: null, selectedId: '', search: '' })
      clearTest()
      form.value = emptyForm()
      editorDialog.value?.handleClose(true)
      drawer.value?.handleClose(true)
    },
    { flush: 'sync' }
  )
  onBeforeUnmount(() => {
    alive = false
    generation++
    invocation++
    editGeneration++
    selectionAction++
    guideAction++
    drawerSession++
    resetCallControls()
    resetCallOverlays()
  })
  onActivated(() => {
    active = true
  })
  onDeactivated(() => {
    active = false
    generation++
    drawerSession++
    list.loading = false
    clearTest()
  })
  defineExpose({
    open: async (options?: { sql?: string }) => {
      if (!alive) return
      const owner = identity.value
      const session = ++drawerSession
      await drawer.value?.handleOpen(undefined, {
        title: '查询 API',
        subtitle: '将授权的只读查询作为稳定接口调用',
        headerIcon: 'ri:code-box-line',
        onClose: async () => {
          if (!alive || owner !== identity.value || session !== drawerSession) return false
          const version = generation
          if (!((await resultTable.value?.confirmLeave()) ?? true)) return false
          if (
            !alive ||
            owner !== identity.value ||
            version !== generation ||
            session !== drawerSession
          )
            return false
          generation++
          drawerSession++
          list.loading = false
          clearTest()
          return true
        }
      })
      if (!alive || owner !== identity.value || session !== drawerSession) return
      const loaded = await loadSnapshot()
      if (!alive || owner !== identity.value || session !== drawerSession) return
      if (loaded && options?.sql && canManage.value) await editDefinition(undefined, options.sql)
    }
  })
</script>
