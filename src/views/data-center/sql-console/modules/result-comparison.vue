<template>
  <ArtDrawer
    ref="drawer"
    :size="1100"
    :show-confirm-button="false"
    :show-form-focus-button="false"
    cancel-text="返回结果表"
    @close="clearState"
  >
    <div class="flex min-w-0 flex-col gap-4">
      <div class="grid min-w-0 gap-3 sm:grid-cols-2">
        <ArtSectionCard title="基线快照" :show-scrollbar="false">
          <ArtDescriptions
            :data="baselineMeta"
            :items="sourceItems"
            :columns="1"
            :label-width="80"
          />
          <PlanCodePreview
            v-if="baseline?.query"
            class="mt-3"
            title="基线 SQL"
            language="sql"
            :code="baseline.query"
            max-height="220px"
          />
        </ArtSectionCard>
        <ArtSectionCard title="当前快照" :show-scrollbar="false">
          <ArtDescriptions
            :data="currentMeta"
            :items="sourceItems"
            :columns="1"
            :label-width="80"
          />
          <PlanCodePreview
            v-if="current?.query"
            class="mt-3"
            title="当前 SQL"
            language="sql"
            :code="current.query"
            max-height="220px"
          />
        </ArtSectionCard>
      </div>
      <ElAlert
        v-if="baseline?.truncated || current?.truncated"
        type="warning"
        :title="truncationMessage"
        :closable="false"
        show-icon
      />
      <p class="m-0 text-xs leading-5 text-g-700">
        仅比较双方已加载原始结果，包含全部本地分页与隐藏列；新增 / 缺失不代表数据库物理删除。
        文本严格比较，1.00 与 1.0 视为不同；字段类型变化单独列出，不按行顺序匹配。 JSON
        文本也逐字比较，不归一化空白或数值。 比较的是已接收到的值；JavaScript
        已损失的精度无法恢复，文本形式的高精度数值保留原样。
      </p>
      <ArtForm
        v-model="matching"
        :items="matchingItems"
        label-position="left"
        :label-width="100"
        class="px-0! pt-0!"
      />
      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="m-0 min-w-0 flex-1 text-xs leading-5 text-g-700">
          请选择每行均非 NULL、唯一且精度安全的共同字段；多个字段将组成联合唯一键。
        </p>
        <div class="flex flex-wrap items-center gap-2">
          <ElButton v-if="state.loading" @click="cancelComparison">取消对比</ElButton>
          <ElButton
            type="primary"
            :loading="state.loading"
            :disabled="!canCompare"
            @click="compare"
          >
            <ArtSvgIcon icon="ri:git-pull-request-line" />开始对比
          </ElButton>
        </div>
      </div>
      <template v-if="state.report">
        <div class="flex flex-wrap items-center gap-2 text-sm" role="status">
          <ElTag type="success" effect="plain">新增 {{ state.report.addedCount }}</ElTag>
          <ElTag type="warning" effect="plain">缺失 {{ state.report.removedCount }}</ElTag>
          <ElTag type="primary" effect="plain">修改 {{ state.report.modifiedCount }}</ElTag>
          <ElTag type="info" effect="plain">未变 {{ state.report.unchangedCount }}</ElTag>
          <span class="text-xs text-g-700"
            >字段结构变化 {{ state.report.schemaChanges.length }} 项</span
          >
        </div>
        <ArtSectionCard
          v-if="state.report.schemaChanges.length"
          title="字段结构变化"
          subtitle="字段新增、缺失与声明类型变化；不据此推断数据库结构发生过修改。"
          :show-scrollbar="false"
        >
          <div class="min-w-0" :style="schemaPaginated ? { height: '300px' } : undefined">
            <ArtTable
              :data="state.report.schemaChanges"
              :columns="schemaColumns"
              :show-table-header="false"
              :height="schemaPaginated ? '100%' : undefined"
              :max-height="schemaPaginated ? undefined : 260"
              :client-pagination="schemaPaginated"
              :pagination="
                schemaPaginated
                  ? {
                      current: table.schemaPage,
                      size: 10,
                      total: state.report.schemaChanges.length
                    }
                  : false
              "
              @pagination:current-change="table.schemaPage = $event"
            />
          </div>
        </ArtSectionCard>
        <ArtForm
          v-model="filters"
          :items="filterItems"
          label-position="left"
          :label-width="76"
          class="px-0! pt-0!"
        />
      </template>
      <ArtSectionCard
        title="结果差异"
        :subtitle="
          state.loading
            ? '正在按唯一匹配键比较，可取消本次计算。'
            : '缺失仅指匹配键未出现在当前已加载结果；所有操作只在内存中进行。'
        "
        :loading="state.loading"
        :error="state.error"
        error-title="结果对比未完成"
        :empty="!state.report || !filteredRows.length"
        :empty-title="emptyTitle"
        :empty-description="emptyDescription"
        :show-scrollbar="false"
      >
        <template #error-action>
          <ElButton type="primary" :disabled="!canCompare" @click="compare">重试对比</ElButton>
        </template>
        <div class="min-w-0" :style="overviewPaginated ? { height: '420px' } : undefined">
          <ArtTable
            :data="filteredRows"
            :columns="overviewColumns"
            :show-table-header="false"
            :height="overviewPaginated ? '100%' : undefined"
            :max-height="overviewPaginated ? undefined : 420"
            row-key="rowKey"
            :client-pagination="overviewPaginated"
            :pagination="
              overviewPaginated
                ? { current: table.page, size: table.size, total: filteredRows.length }
                : false
            "
            :pagination-options="{ pageSizes: [20, 50, 100] }"
            border
            @pagination:current-change="table.page = $event"
            @pagination:size-change="changePageSize"
          />
        </div>
      </ArtSectionCard>
    </div>
    <template #footer>
      <div class="flex w-full min-w-0 flex-col gap-2">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <ElButton :disabled="!state.report || state.loading" @click="downloadDiff">
            <ArtSvgIcon icon="ri:download-2-line" />下载对比 JSON
          </ElButton>
          <ElButton type="primary" @click="drawer?.handleClose()">返回结果表</ElButton>
        </div>
        <span class="text-xs leading-5 text-g-700"
          >导出全部差异与结构，不受筛选影响；不含未变行值。</span
        >
      </div>
    </template>
  </ArtDrawer>
  <ArtDrawer
    ref="detailDrawer"
    :size="1000"
    :show-confirm-button="false"
    :show-form-focus-button="false"
    cancel-text="返回对比"
    @close="clearDetail"
  >
    <div v-if="detail.row" class="flex min-w-0 flex-col gap-4">
      <div class="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <code class="min-w-0 flex-1 break-all text-xs">{{ detail.row.source.identity }}</code>
        <ElButton link type="primary" @click="showFullKey">查看完整匹配键</ElButton>
      </div>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class="text-xs text-g-700"
          >{{ statusLabels[detail.row.status] }} · 基线：
          {{ rowLocation(detail.row.source.baselineIndex) }} · 当前：
          {{ rowLocation(detail.row.source.currentIndex) }}</span
        >
        <ElSwitch
          v-model="detail.onlyChanged"
          aria-label="仅看变更字段"
          active-text="仅看变更字段"
        />
      </div>
      <ArtSectionCard
        title="逐字段对照"
        subtitle="文本预览带引号，完整值为原文；对象 / 数组使用保留类型的表示，缺失属性与 NULL 分别标记。"
        :empty="!detailRows.length"
        empty-title="当前没有变更字段"
        empty-description="关闭“仅看变更字段”可核对该行全部字段。"
        :show-scrollbar="false"
      >
        <div class="min-w-0" :style="detailPaginated ? { height: '460px' } : undefined">
          <ArtTable
            :data="detailRows"
            :columns="detailColumns"
            :show-table-header="false"
            :height="detailPaginated ? '100%' : undefined"
            :max-height="detailPaginated ? undefined : 460"
            :client-pagination="detailPaginated"
            :pagination="
              detailPaginated ? { current: detail.page, size: 20, total: detailRows.length } : false
            "
            border
            @pagination:current-change="detail.page = $event"
          />
        </div>
      </ArtSectionCard>
    </div>
  </ArtDrawer>
  <ArtDrawer
    ref="valueDrawer"
    :size="780"
    :show-confirm-button="false"
    :show-form-focus-button="false"
    cancel-text="返回字段对照"
    @close="clearValue"
  >
    <div class="flex min-w-0 flex-col gap-3">
      <p class="m-0 break-all text-xs text-g-700">{{ valueView.description }}</p>
      <PlanCodePreview
        :key="valueView.revision"
        title="字段值"
        language="plaintext"
        :code="valueView.content"
        expanded
        max-height="calc(100dvh - 280px)"
      />
    </div>
  </ArtDrawer>
</template>

<script setup lang="ts">
  import {
    computed,
    h,
    onScopeDispose,
    reactive,
    ref,
    shallowReactive,
    shallowRef,
    watch
  } from 'vue'
  import { ElButton, ElMessage, ElTag } from 'element-plus'
  import { intersection, truncate, union } from 'lodash-es'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtDescriptions from '@/components/core/base/art-descriptions/index.vue'
  import type { ArtDescriptionItem } from '@/components/core/base/art-descriptions/types'
  import ArtTable from '@/components/core/tables/art-table/index.vue'
  import type { ColumnOption } from '@/types'
  import { downloadBlob } from '@/utils/file'
  import { formatDateTimeValue } from '@/utils/ui'
  import { getOwnRecordValue } from '@/utils/record'
  import PlanCodePreview from './plan-code-preview.vue'
  import {
    compareSqlResults,
    exportSqlResultComparison,
    formatComparisonValue,
    SqlResultCompareError,
    type SqlResultComparison,
    type SqlResultCompareColumn,
    type SqlResultRowDifference,
    type SqlResultSchemaChange,
    type SqlResultSnapshot
  } from './result-compare'

  const props = defineProps<{
    baseline: SqlResultSnapshot | null
    current: SqlResultSnapshot | null
  }>()
  type DifferenceStatus = 'added' | 'removed' | 'modified' | 'unchanged'
  interface OverviewRow {
    rowKey: string
    status: DifferenceStatus
    source: SqlResultRowDifference
  }
  interface ComparisonState {
    active: boolean
    loading: boolean
    cancelled: boolean
    error: string
    report: SqlResultComparison | null
  }
  interface SourceMeta {
    source: string
    time: string
    size: string
  }
  interface FieldCell {
    present: boolean
    rowPresent: boolean
    kind: string
    sqlType: string
    content: string
    rawText?: string
  }
  interface DetailRow {
    name: string
    changed: boolean
    before: FieldCell
    after: FieldCell
  }
  const drawer = ref<ArtDrawerExpose>()
  const detailDrawer = ref<ArtDrawerExpose>()
  const valueDrawer = ref<ArtDrawerExpose>()
  const controller = shallowRef<AbortController>()
  const state = shallowReactive<ComparisonState>({
    active: false,
    loading: false,
    cancelled: false,
    error: '',
    report: null
  })
  const matching = ref<{ keys: string[] }>({ keys: [] })
  const filters = ref<{ status: DifferenceStatus | 'changes' | 'all'; keyword: string }>({
    status: 'changes',
    keyword: ''
  })
  const table = reactive({ page: 1, size: 20, schemaPage: 1 })
  const detail = shallowReactive<{ row: OverviewRow | null; onlyChanged: boolean; page: number }>({
    row: null,
    onlyChanged: false,
    page: 1
  })
  const valueView = reactive({ content: '', description: '', revision: 0 })
  const statusLabels = { added: '新增', removed: '缺失', modified: '修改', unchanged: '未变' }
  const statusTypes = {
    added: 'success',
    removed: 'warning',
    modified: 'primary',
    unchanged: 'info'
  } as const
  const schemaLabels = { added: '新增字段', removed: '缺失字段', 'type-changed': '类型变化' }
  const commonFields = computed(() =>
    intersection(
      props.baseline?.columns.map(({ name }) => name) || [],
      props.current?.columns.map(({ name }) => name) || []
    )
  )
  const canCompare = computed(() =>
    Boolean(props.baseline && props.current && matching.value.keys.length)
  )
  const matchingItems = computed<FormItem[]>(() => [
    {
      key: 'keys',
      label: '唯一匹配键',
      type: 'selectV2',
      span: 24,
      options: commonFields.value.map((name) => ({ label: name, value: name })),
      props: {
        multiple: true,
        filterable: true,
        collapseTags: true,
        collapseTagsTooltip: true,
        maxCollapseTags: 3,
        'aria-label': '唯一匹配键',
        placeholder: commonFields.value.length ? '选择一个或多个共同字段' : '双方没有共同字段'
      }
    }
  ])
  const filterItems: FormItem[] = [
    {
      key: 'status',
      label: '差异状态',
      type: 'select',
      span: 8,
      options: [
        { label: '全部差异', value: 'changes' },
        ...Object.entries(statusLabels).map(([value, label]) => ({ value, label })),
        { label: '全部行', value: 'all' }
      ],
      props: { clearable: false, 'aria-label': '差异状态' }
    },
    {
      key: 'keyword',
      label: '搜索',
      type: 'input',
      span: 16,
      props: {
        clearable: true,
        'aria-label': '搜索匹配键或字段',
        placeholder: '匹配键或变更字段名称'
      }
    }
  ]
  const sourceItems: ArtDescriptionItem<SourceMeta>[] = [
    { key: 'source', label: '来源', field: 'source' },
    { key: 'time', label: '保留时间', field: 'time' },
    { key: 'size', label: '数据规模', field: 'size' }
  ]
  const sourceMeta = (snapshot: SqlResultSnapshot | null): SourceMeta => ({
    source: snapshot?.label || '查询原始结果',
    time: snapshot ? formatDateTimeValue(snapshot.capturedAt) : '尚无快照',
    size: snapshot ? `${snapshot.rows.length} 行 · ${snapshot.columns.length} 列` : '—'
  })
  const baselineMeta = computed(() => sourceMeta(props.baseline))
  const currentMeta = computed(() => sourceMeta(props.current))
  const baselineColumns = computed(
    () => new Map((props.baseline?.columns || []).map((column) => [column.name, column]))
  )
  const currentColumns = computed(
    () => new Map((props.current?.columns || []).map((column) => [column.name, column]))
  )
  const truncationMessage = computed(
    () =>
      `${props.baseline?.truncated ? '基线' : ''}${props.baseline?.truncated && props.current?.truncated ? '与' : ''}${props.current?.truncated ? '当前' : ''}结果已达到返回上限；仅已加载结果的新增 / 缺失，不代表数据库物理删除。`
  )
  const overviewRows = computed<OverviewRow[]>(() => {
    const report = state.report
    if (!report) return []
    return (['added', 'removed', 'modified', 'unchanged'] as const).flatMap((status) =>
      report[status].map((source) => ({ rowKey: `${status}:${source.key}`, status, source }))
    )
  })
  const filteredRows = computed(() => {
    const keyword = filters.value.keyword.trim().toLowerCase()
    return overviewRows.value.filter(
      (row) =>
        (filters.value.status === 'all' ||
          (filters.value.status === 'changes'
            ? row.status !== 'unchanged'
            : row.status === filters.value.status)) &&
        (!keyword ||
          `${row.source.key}\n${row.source.identity}\n${row.source.changedFields.join('\n')}`
            .toLowerCase()
            .includes(keyword))
    )
  })
  const schemaPaginated = computed(() => (state.report?.schemaChanges.length || 0) > 10)
  const overviewPaginated = computed(() => filteredRows.value.length > table.size)
  const emptyTitle = computed(() =>
    !props.baseline || !props.current
      ? '需要两份结果快照'
      : state.cancelled
        ? '已取消本次对比'
        : !state.report
          ? '选择唯一匹配键后开始对比'
          : '当前筛选下没有行差异'
  )
  const emptyDescription = computed(() =>
    !props.baseline || !props.current
      ? '先保留一份基线，再执行查询并打开结果对比。'
      : state.cancelled
        ? '可调整匹配键后重新开始；已取消的计算不会生成结果。'
        : !state.report
          ? '不会按行序推断匹配关系，也不会重新执行 SQL。'
          : '可切换其他差异状态或清空搜索；声明类型变化在字段结构区域单独展示。'
  )
  const rowNumber = (index: number | undefined): string =>
    index === undefined ? '—' : String(index + 1)
  const rowLocation = (index: number | undefined): string =>
    index === undefined ? '未出现在该结果' : `第 ${index + 1} 行`
  const overviewColumns: ColumnOption<OverviewRow>[] = [
    {
      prop: 'status',
      label: '状态',
      width: 80,
      formatter: (row) =>
        h(
          ElTag,
          { type: statusTypes[row.status], effect: 'plain', size: 'small' },
          () => statusLabels[row.status]
        )
    },
    {
      prop: 'identity',
      label: '匹配键',
      minWidth: 220,
      formatter: (row) => h('span', { class: 'break-all font-mono text-xs' }, row.source.identity)
    },
    {
      prop: 'changedFields',
      label: '变更字段',
      minWidth: 180,
      showOverflowTooltip: true,
      formatter: (row) => row.source.changedFields.join('、') || '—'
    },
    {
      prop: 'baselineIndex',
      label: '基线行',
      width: 76,
      formatter: (row) => rowNumber(row.source.baselineIndex)
    },
    {
      prop: 'currentIndex',
      label: '当前行',
      width: 76,
      formatter: (row) => rowNumber(row.source.currentIndex)
    },
    {
      prop: 'operation',
      label: '详情',
      width: 100,
      formatter: (row) =>
        h(
          ElButton,
          { link: true, type: 'primary', onClick: () => void showRow(row) },
          () => '查看详情'
        )
    }
  ]
  const schemaColumns: ColumnOption<SqlResultSchemaChange>[] = [
    { prop: 'name', label: '字段', minWidth: 160 },
    { prop: 'kind', label: '结构变化', width: 110, formatter: (row) => schemaLabels[row.kind] },
    {
      prop: 'beforeType',
      label: '基线类型',
      minWidth: 140,
      formatter: (row) => (row.kind === 'added' ? '（无字段）' : row.beforeType || '未提供类型')
    },
    {
      prop: 'afterType',
      label: '当前类型',
      minWidth: 140,
      formatter: (row) => (row.kind === 'removed' ? '（无字段）' : row.afterType || '未提供类型')
    }
  ]
  const runtimeLabels: Record<string, string> = {
    string: '文本',
    number: '数值',
    bigint: '大整数',
    boolean: '布尔值',
    object: 'JSON 对象'
  }
  const runtimeKind = (value: unknown): string =>
    value === null
      ? 'NULL'
      : value === undefined
        ? 'undefined'
        : Array.isArray(value)
          ? 'JSON 数组'
          : runtimeLabels[typeof value] || '未知类型'
  const fieldCell = (
    columns: Map<string, SqlResultCompareColumn>,
    row: Record<string, unknown> | undefined,
    name: string
  ): FieldCell => {
    const column = columns.get(name)
    const property = column?.property ?? name
    const present = Boolean(column && row && Object.hasOwn(row, property))
    const value = present && row ? getOwnRecordValue(row, property) : undefined
    return {
      present,
      rowPresent: Boolean(row),
      kind: !row ? '行未出现' : !present ? '未返回属性' : runtimeKind(value),
      sqlType: column?.fullType || column?.type || '未提供类型',
      content: !row ? '（该行未出现在此已加载结果）' : formatComparisonValue(value, present),
      rawText: typeof value === 'string' ? value : undefined
    }
  }
  const detailRows = computed<DetailRow[]>(() => {
    const selected = detail.row?.source
    if (!selected) return []
    const changed = new Set(selected.changedFields)
    return union(
      props.baseline?.columns.map(({ name }) => name) || [],
      props.current?.columns.map(({ name }) => name) || []
    )
      .filter((name) => !detail.onlyChanged || changed.has(name))
      .map((name) => ({
        name,
        changed: changed.has(name),
        before: fieldCell(baselineColumns.value, selected.before, name),
        after: fieldCell(currentColumns.value, selected.after, name)
      }))
  })
  const detailPaginated = computed(() => detailRows.value.length > 20)
  const renderFieldCell = (row: DetailRow, side: 'before' | 'after') => {
    const cell = row[side]
    const label = side === 'before' ? '基线' : '当前'
    return h('div', { class: 'flex min-w-0 flex-col gap-1 py-1' }, [
      h('span', { class: 'text-xs text-g-600' }, `${cell.kind} · ${cell.sqlType}`),
      h(
        'span',
        { class: 'whitespace-pre-wrap break-all font-mono text-xs' },
        truncate(cell.content, { length: 180 })
      ),
      cell.present
        ? h(
            ElButton,
            {
              link: true,
              type: 'primary',
              size: 'small',
              class: 'self-start',
              onClick: () => void showValue(row, side)
            },
            () => `查看${label}完整值`
          )
        : null
    ])
  }
  const detailColumns: ColumnOption<DetailRow>[] = [
    {
      prop: 'name',
      label: '字段',
      minWidth: 150,
      formatter: (row) =>
        h('div', { class: 'flex flex-col gap-1' }, [
          h('span', { class: 'break-all font-mono text-xs' }, row.name),
          h('span', { class: 'text-xs text-g-600' }, row.changed ? '值 / 存在性变化' : '值未变')
        ])
    },
    {
      prop: 'before',
      label: '基线值',
      minWidth: 240,
      formatter: (row) => renderFieldCell(row, 'before')
    },
    {
      prop: 'after',
      label: '当前值',
      minWidth: 240,
      formatter: (row) => renderFieldCell(row, 'after')
    }
  ]
  const yieldControl = (): Promise<void> =>
    new Promise((resolve) => globalThis.setTimeout(resolve, 0))
  const clearValue = (): void => {
    valueView.content = ''
    valueView.description = ''
  }
  const clearDetail = (): void => {
    detail.row = null
    detail.page = 1
    clearValue()
    void valueDrawer.value?.handleClose(true)
  }
  const invalidate = (): void => {
    controller.value?.abort()
    controller.value = undefined
    Object.assign(state, { loading: false, cancelled: false, error: '', report: null })
    Object.assign(table, { page: 1, schemaPage: 1 })
    clearDetail()
    void detailDrawer.value?.handleClose(true)
  }
  const clearState = (): void => {
    state.active = false
    invalidate()
    matching.value = { keys: [] }
    filters.value = { status: 'changes', keyword: '' }
  }
  const reset = (): void => {
    const active = state.active
    clearState()
    if (active) void drawer.value?.handleClose(true)
  }
  const open = async (): Promise<void> => {
    reset()
    matching.value = { keys: commonFields.value.includes('id') ? ['id'] : [] }
    state.active = true
    await drawer.value?.handleOpen(undefined, {
      title: '结果对比',
      subtitle: '唯一键匹配 · 已加载原始结果 · 本地只读',
      headerIcon: 'ri:git-pull-request-line'
    })
  }
  const compare = async (): Promise<void> => {
    if (
      !state.active ||
      state.loading ||
      !props.baseline ||
      !props.current ||
      !matching.value.keys.length
    )
      return
    invalidate()
    const pending = new AbortController()
    const baseline = props.baseline
    const current = props.current
    const keys = [...matching.value.keys]
    controller.value = pending
    state.loading = true
    try {
      await yieldControl()
      const report = await compareSqlResults(baseline, current, keys, {
        signal: pending.signal,
        yieldControl
      })
      if (!state.active || pending.signal.aborted || controller.value !== pending) return
      state.report = report
    } catch (error) {
      if (!pending.signal.aborted && state.active && controller.value === pending)
        state.error =
          error instanceof SqlResultCompareError
            ? error.message
            : '暂时无法完成结果对比，请重试或重新选择匹配键。'
    } finally {
      if (controller.value === pending) state.loading = false
    }
  }
  const cancelComparison = (): void => {
    invalidate()
    state.cancelled = true
  }
  const showRow = async (row: OverviewRow): Promise<void> => {
    // Native table stores may proxy callback rows; retain our immutable source instead.
    const canonical = overviewRows.value.find((item) => item.rowKey === row.rowKey)
    if (!state.active || !canonical) return
    clearDetail()
    Object.assign(detail, { row: canonical, onlyChanged: canonical.status === 'modified', page: 1 })
    await detailDrawer.value?.handleOpen(undefined, {
      title: '对比行详情',
      subtitle: `${statusLabels[canonical.status]} · 存在性与原始值对照`,
      headerIcon: 'ri:table-line'
    })
  }
  const showValue = async (row: DetailRow, side: 'before' | 'after'): Promise<void> => {
    const cell = row[side]
    if (!state.active || !cell.present) return
    Object.assign(valueView, {
      content: cell.rawText ?? cell.content,
      description: `${side === 'before' ? '基线' : '当前'} · ${row.name} · ${cell.kind} · ${cell.sqlType}`,
      revision: valueView.revision + 1
    })
    await valueDrawer.value?.handleOpen(undefined, {
      title: '字段值详情',
      subtitle: '文本为原文；对象 / 数组为保留类型的表示 · 只读',
      headerIcon: 'ri:braces-line'
    })
  }
  const showFullKey = async (): Promise<void> => {
    if (!state.active || !detail.row || !state.report) return
    Object.assign(valueView, {
      content: detail.row.source.key,
      description: `完整类型化匹配键 · 字段顺序：${state.report.keyFields.join('、')}`,
      revision: valueView.revision + 1
    })
    await valueDrawer.value?.handleOpen(undefined, {
      title: '字段值详情',
      subtitle: '完整匹配键 · 不使用截短摘要作为行身份',
      headerIcon: 'ri:key-2-line'
    })
  }
  const downloadDiff = (): void => {
    if (!state.active || state.loading || !state.report) return
    try {
      downloadBlob(
        new Blob([exportSqlResultComparison(state.report)], {
          type: 'application/json;charset=utf-8'
        }),
        'SQL结果对比.json'
      )
    } catch {
      ElMessage.error('下载对比失败，请重试。')
    }
  }
  const changePageSize = (size: number): void => {
    table.size = size
    table.page = 1
  }
  watch(() => matching.value.keys, invalidate, { deep: true })
  watch([() => filters.value.status, () => filters.value.keyword], () => {
    table.page = 1
  })
  watch(
    () => detail.onlyChanged,
    () => {
      detail.page = 1
    }
  )
  watch([() => props.baseline, () => props.current], reset, { flush: 'sync' })
  onScopeDispose(reset)
  defineExpose({ open, reset })
</script>
