<template>
  <DefineOverview>
    <div class="flex min-w-0 flex-col gap-4">
      <ArtSectionCard
        title="字段概览"
        :subtitle="
          selectedColumn
            ? `字段类型：${selectedColumn.fullType || selectedColumn.type || '未提供类型'}`
            : ''
        "
        :loading="summary.loading"
        :error="summary.error"
        error-title="字段统计未完成"
        :empty="!rows.length || !selectedColumn"
        :empty-title="rows.length && columns.length ? '请选择统计字段' : '暂无可统计的结果'"
        :empty-description="
          rows.length && columns.length
            ? '从上方选择一个字段查看统计。'
            : '执行返回字段与数据的查询后，再打开字段统计。'
        "
        :skeleton-rows="4"
        :show-scrollbar="false"
        @retry="calculate"
      >
        <template v-if="summary.profile">
          <ArtDescriptions
            :data="summary.profile"
            :items="overviewItems"
            :columns="2"
            :tablet-columns="2"
            :mobile-columns="1"
            :label-width="132"
          />
          <p class="m-0 mt-3 text-xs leading-5 text-g-700">
            NULL / 缺失值包含未返回的属性；空字符串仅指长度为 0
            的文本，纯空白字符串指非空且仅含空白的文本。非 NULL 行数包含空字符串与纯空白字符串。
            不同值不含 NULL；重复额外行数 = 已归类的非 NULL 行数 − 不同值，文本与数值分别计数。
          </p>
          <ElAlert
            v-if="summary.profile.limits.length"
            class="mt-3"
            type="warning"
            :title="summary.profile.limits.join('；')"
            :closable="false"
            show-icon
          />
        </template>
      </ArtSectionCard>
      <template v-if="summary.profile && !summary.loading && !summary.error">
        <ArtSectionCard
          v-if="summary.profile.numeric"
          title="数值汇总"
          subtitle="仅统计有效数值；十进制字符串精确计算，≈ 表示平均值为近似值。"
          :show-scrollbar="false"
        >
          <ArtDescriptions
            :data="summary.profile.numeric"
            :items="numericItems"
            :columns="2"
            :tablet-columns="2"
            :mobile-columns="1"
            :label-width="108"
          />
          <p class="m-0 mt-3 text-xs leading-5 text-g-700">{{ numericCoverage }}</p>
        </ArtSectionCard>
        <ArtSectionCard
          v-if="summary.profile.text.count"
          title="文本长度"
          subtitle="仅统计文本值，包含空字符串；长度按 Unicode 字符（码点）计算，组合表情可能包含多个码点。"
          :show-scrollbar="false"
        >
          <ArtDescriptions
            :data="summary.profile.text"
            :items="textItems"
            :columns="2"
            :tablet-columns="2"
            :mobile-columns="1"
            :label-width="108"
          />
          <p v-if="summary.profile.text.limitedCount" class="m-0 mt-3 text-xs leading-5 text-g-700">
            {{ summary.profile.text.limitedCount }} 行超出文本统计范围，未计入长度汇总。
          </p>
        </ArtSectionCard>
      </template>
    </div>
  </DefineOverview>
  <DefineDistribution>
    <ArtSectionCard
      v-if="summary.profile && !summary.loading && !summary.error"
      title="常见值 Top 10"
      :subtitle="
        summary.profile.topValuesComplete
          ? '按出现次数降序；次数相同保留首次出现顺序。比例以全部已加载行数为分母，不含 NULL。'
          : '仅覆盖可归类的非 NULL 值；部分值未参与排名。比例以全部已加载行数为分母。'
      "
      :empty="!summary.profile.topValues.length"
      empty-title="没有可归类的非 NULL 值"
      empty-description="NULL 不参与常见值排名；复杂对象或超出安全统计范围的值会另行提示。"
      :show-scrollbar="false"
    >
      <ArtTable
        :data="summary.profile.topValues"
        :columns="topColumns"
        :show-table-header="false"
        :show-header="true"
        :max-height="440"
        border
      />
    </ArtSectionCard>
  </DefineDistribution>
  <ArtDrawer
    ref="drawer"
    :size="960"
    :show-confirm-button="false"
    :show-form-focus-button="false"
    cancel-text="返回结果表"
    @opened="startProfile"
    @close="reset"
  >
    <div class="sql-result-profile flex min-w-0 flex-col gap-4">
      <div
        class="flex flex-wrap items-center justify-between gap-2 text-xs leading-5 text-g-700"
        role="status"
      >
        <span>本次已加载 {{ rows.length }} 行 · {{ columns.length }} 列</span>
        <span>涵盖全部本地分页，不受结果筛选和编辑副本影响</span>
      </div>
      <ElAlert
        v-if="truncated"
        type="warning"
        title="查询已达到返回上限，统计仅覆盖本次已加载的数据，不能代表数据库全量。"
        :closable="false"
        show-icon
      />
      <ArtForm
        v-if="columns.length"
        v-model="selection"
        :items="formItems"
        label-position="left"
        :label-width="76"
        class="px-0! pt-0!"
      />
      <ElTabs v-if="showProfileTabs" v-model="profileTab">
        <ElTabPane label="统计概览" name="overview" :lazy="false">
          <ReuseOverview />
        </ElTabPane>
        <ElTabPane label="值分布" name="distribution" :lazy="false">
          <ReuseDistribution />
        </ElTabPane>
      </ElTabs>
      <template v-else>
        <ReuseOverview />
        <ReuseDistribution />
      </template>
    </div>
    <template #footer>
      <div class="flex w-full flex-wrap items-center justify-between gap-2">
        <ElButton
          :disabled="!summary.profile || summary.loading || Boolean(summary.error)"
          @click="downloadSummary"
        >
          <ArtSvgIcon icon="ri:download-2-line" />下载当前字段统计 JSON
        </ElButton>
        <ElButton type="primary" @click="drawer?.handleClose()">返回结果表</ElButton>
      </div>
    </template>
  </ArtDrawer>
  <CellContentView ref="cellView" />
</template>

<script setup lang="ts">
  import { computed, h, onScopeDispose, reactive, ref, shallowRef, watch } from 'vue'
  import { ElButton, ElMessage } from 'element-plus'
  import { createReusableTemplate } from '@vueuse/core'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtDescriptions from '@/components/core/base/art-descriptions/index.vue'
  import type { ArtDescriptionItem } from '@/components/core/base/art-descriptions/types'
  import ArtTable from '@/components/core/tables/art-table/index.vue'
  import type { ColumnOption } from '@/types'
  import { downloadBlob } from '@/utils/file'
  import { getOwnRecordValue } from '@/utils/record'
  import { formatPercentValue } from '@/utils/ui'
  import CellContentView, { type CellContentViewExpose } from './cell-content-view.vue'
  import {
    buildSqlResultProfile,
    type SqlResultProfile,
    type SqlResultProfileColumn
  } from './result-profile'

  const props = defineProps<{
    rows: Record<string, unknown>[]
    columns: SqlResultProfileColumn[]
    truncated?: boolean
  }>()
  interface SummaryState {
    active: boolean
    opened: boolean
    loading: boolean
    error: string
    profile: SqlResultProfile | null
  }
  const drawer = ref<ArtDrawerExpose>()
  const cellView = ref<CellContentViewExpose>()
  const selection = ref({ field: '' })
  const profileTab = ref('overview')
  const [DefineOverview, ReuseOverview] = createReusableTemplate()
  const [DefineDistribution, ReuseDistribution] = createReusableTemplate()
  const summary = reactive<SummaryState>({
    active: false,
    opened: false,
    loading: false,
    error: '',
    profile: null
  })
  const showProfileTabs = computed(
    () =>
      !summary.loading &&
      !summary.error &&
      Boolean(
        summary.profile &&
        summary.profile.topValues.length >= 4 &&
        (summary.profile.numeric?.count || summary.profile.text.count)
      )
  )
  const controller = shallowRef<AbortController>()
  const selectedColumn = computed(() =>
    selection.value.field === '' ? undefined : props.columns[Number(selection.value.field)]
  )
  const formItems = computed<FormItem[]>(() => [
    {
      key: 'field',
      label: '统计字段',
      type: 'select',
      span: 24,
      options: props.columns.map((column, index) => ({ label: column.name, value: String(index) })),
      props: {
        filterable: true,
        clearable: false,
        'aria-label': '统计字段',
        placeholder: '选择要统计的字段'
      }
    }
  ])
  const overviewItems = computed<ArtDescriptionItem<SqlResultProfile>[]>(() => [
    { key: 'totalRows', label: '已加载行数', field: 'totalRows' },
    { key: 'nonNullCount', label: '非 NULL 行数', field: 'nonNullCount' },
    { key: 'nullCount', label: 'NULL / 缺失值', field: 'nullCount' },
    { key: 'emptyStringCount', label: '空字符串', field: 'emptyStringCount' },
    { key: 'whitespaceCount', label: '纯空白字符串', field: 'whitespaceCount' },
    {
      key: 'distinctCount',
      label: summary.profile?.distinctExcludedCount ? '已归类非 NULL 不同值' : '非 NULL 不同值',
      field: 'distinctCount'
    },
    {
      key: 'duplicateCount',
      label: summary.profile?.distinctExcludedCount ? '已归类重复额外行数' : '重复额外行数',
      field: 'duplicateCount'
    },
    { key: 'distinctExcludedCount', label: '未归类值', field: 'distinctExcludedCount' }
  ])
  type NumericProfile = NonNullable<SqlResultProfile['numeric']>
  const numericItems: ArtDescriptionItem<NumericProfile>[] = [
    { key: 'count', label: '有效数值', field: 'count' },
    { key: 'sum', label: '合计', field: 'sum', copyable: true },
    { key: 'min', label: '最小值', field: 'min', copyable: true },
    { key: 'max', label: '最大值', field: 'max', copyable: true },
    {
      key: 'average',
      label: '平均值',
      value: (data: NumericProfile) =>
        data.average === null ? null : `${data.averageApproximate ? '≈ ' : ''}${data.average}`,
      copyable: true
    }
  ]
  const textItems: ArtDescriptionItem<SqlResultProfile['text']>[] = [
    { key: 'count', label: '文本行数', field: 'count' },
    { key: 'minLength', label: '最短长度', field: 'minLength' },
    { key: 'maxLength', label: '最长长度', field: 'maxLength' },
    {
      key: 'averageLength',
      label: '平均长度',
      value: (data: SqlResultProfile['text']) =>
        data.averageLength === null
          ? null
          : `${data.averageApproximate ? '≈ ' : ''}${data.averageLength}`
    }
  ]
  type TopValue = SqlResultProfile['topValues'][number]
  const kindLabels: Record<TopValue['kind'], string> = {
    string: '文本',
    number: '数值',
    bigint: '整数',
    boolean: '布尔值'
  }
  const topColumns: ColumnOption<TopValue>[] = [
    {
      prop: 'label',
      label: '值',
      minWidth: 120,
      formatter: (row) =>
        h('div', { class: 'flex min-w-0 flex-col gap-1 py-1' }, [
          h(
            'span',
            {
              class: 'break-all font-mono text-xs',
              title: row.truncated ? '值过长，仅展示摘要' : undefined
            },
            row.label
          ),
          h('span', { class: 'text-xs text-g-600' }, kindLabels[row.kind]),
          row.truncated
            ? h(
                ElButton,
                {
                  link: true,
                  type: 'primary',
                  size: 'small',
                  class: 'self-start',
                  onClick: () => void viewFullValue(row)
                },
                () => '查看完整值'
              )
            : null
        ])
    },
    { prop: 'count', label: '次数', width: 64, align: 'right' },
    {
      prop: 'ratio',
      label: '占全部行',
      width: 86,
      align: 'right',
      formatter: (row) => formatPercentValue(row.ratio * 100)
    }
  ]
  const numericCoverage = computed(() => {
    const numeric = summary.profile?.numeric
    if (!numeric) return ''
    const exclusions = [
      numeric.invalidCount ? `${numeric.invalidCount} 行非 NULL 但不是有效数值（含空文本）` : '',
      numeric.unsafeNumberCount ? `${numeric.unsafeNumberCount} 行 JavaScript 数值精度不安全` : '',
      numeric.nonFiniteCount ? `${numeric.nonFiniteCount} 行非有限数值` : '',
      numeric.limitedCount ? `${numeric.limitedCount} 行超出安全计算范围` : ''
    ].filter(Boolean)
    return exclusions.length
      ? `未计入数值汇总：${exclusions.join('；')}。NULL 不补零。`
      : '全部有效数值均已计入；NULL 不补零。'
  })

  const yieldControl = (): Promise<void> =>
    new Promise((resolve) => globalThis.setTimeout(resolve, 0))
  const viewFullValue = async (row: TopValue): Promise<void> => {
    const column = selectedColumn.value
    if (
      !summary.active ||
      !column ||
      !Number.isInteger(row.sourceRowIndex) ||
      row.sourceRowIndex < 0 ||
      row.sourceRowIndex >= props.rows.length
    )
      return
    const source = props.rows[row.sourceRowIndex]
    const property = column.property ?? column.name
    if (!Object.hasOwn(source, property)) return
    const value = getOwnRecordValue(source, property)
    if (
      typeof value !== 'string' &&
      typeof value !== 'number' &&
      typeof value !== 'bigint' &&
      typeof value !== 'boolean'
    )
      return
    await cellView.value?.handleOpen({ content: String(value), columnName: column.name })
  }
  const reset = (): void => {
    profileTab.value = 'overview'
    controller.value?.abort()
    controller.value = undefined
    cellView.value?.reset()
    Object.assign(summary, {
      active: false,
      opened: false,
      loading: false,
      error: '',
      profile: null
    })
    selection.value = { field: '' }
  }
  const calculate = async (): Promise<void> => {
    profileTab.value = 'overview'
    controller.value?.abort()
    const column = selectedColumn.value
    if (!summary.active || !summary.opened) return
    if (!column || !props.rows.length) {
      Object.assign(summary, { loading: false, error: '', profile: null })
      return
    }
    const pending = new AbortController()
    controller.value = pending
    Object.assign(summary, { loading: true, error: '', profile: null })
    try {
      await yieldControl()
      const profile = await buildSqlResultProfile(props.rows, column, {
        signal: pending.signal,
        yieldControl
      })
      if (pending.signal.aborted || controller.value !== pending || !summary.active) return
      summary.profile = profile
    } catch {
      if (!pending.signal.aborted && controller.value === pending && summary.active)
        summary.error = '暂时无法统计该字段，请重试或选择其他字段。'
    } finally {
      if (controller.value === pending) summary.loading = false
    }
  }
  const startProfile = (): void => {
    if (!summary.active) return
    summary.opened = true
    void calculate()
  }
  const open = async (): Promise<void> => {
    reset()
    selection.value = { field: props.columns.length ? '0' : '' }
    Object.assign(summary, {
      active: true,
      loading: Boolean(props.rows.length && props.columns.length)
    })
    await drawer.value?.handleOpen(undefined, {
      title: '字段统计',
      subtitle: '全部已加载原始结果 · 不重新执行 SQL',
      headerIcon: 'ri:bar-chart-horizontal-line'
    })
  }
  const downloadSummary = (): void => {
    if (
      !summary.active ||
      !summary.profile ||
      summary.loading ||
      summary.error ||
      !selectedColumn.value
    )
      return
    try {
      const content = {
        scope: 'loaded-original-results',
        truncated: Boolean(props.truncated),
        column: selectedColumn.value,
        ...summary.profile
      }
      downloadBlob(
        new Blob([JSON.stringify(content, null, 2)], { type: 'application/json;charset=utf-8' }),
        'SQL字段统计.json'
      )
    } catch {
      ElMessage.error('下载统计失败，请重试。')
    }
  }
  watch(
    () => selection.value.field,
    () => {
      if (summary.opened) void calculate()
    }
  )
  watch(
    [() => props.rows, () => props.columns, () => props.truncated],
    () => {
      const active = summary.active
      reset()
      if (active) void drawer.value?.handleClose(true)
    },
    { flush: 'sync' }
  )
  onScopeDispose(reset)
  defineExpose({ open })
</script>
