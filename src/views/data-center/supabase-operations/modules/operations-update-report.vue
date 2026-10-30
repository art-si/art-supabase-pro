<template>
  <section
    class="min-w-0 shrink-0 space-y-4"
    aria-label="已有备份更新结果"
    data-testid="operations-update-report"
  >
    <ElAlert
      v-if="running"
      title="正在比较或更新备份"
      description="原目录提交前会先校验暂存快照。可在日志中查看当前比较的表和下载内容。"
      type="info"
      show-icon
      :closable="false"
    />
    <template v-else-if="report">
      <ElAlert
        :title="title"
        :description="report.error || description"
        :type="
          report.status === 'failed' ? 'error' : report.status === 'planned' ? 'info' : 'success'
        "
        show-icon
        :closable="false"
      />
      <dl class="grid grid-cols-2 gap-3 rounded-lg bg-g-100 p-4 sm:grid-cols-4">
        <div v-for="metric in metrics" :key="metric.label"
          ><dt class="text-xs text-g-700">{{ metric.label }}</dt
          ><dd class="mt-1 text-xl font-semibold text-g-900 tabular-nums">{{
            metric.value
          }}</dd></div
        >
      </dl>
      <div class="flex flex-wrap items-center gap-2">
        <ElButton
          v-if="report.mode === 'preview' && report.status === 'planned'"
          v-auth="'SupabaseOperations:UpdateBackup'"
          type="primary"
          @click="emit('prepare-update', report)"
          >使用此计划准备更新</ElButton
        >
        <ElButton
          v-if="report.status === 'failed'"
          v-auth="'SupabaseOperations:PreviewUpdate'"
          plain
          @click="emit('prepare-check', report.backupPath)"
          >重新检查并恢复更新</ElButton
        >
        <ElButton v-auth="'SupabaseOperations:Read'" plain @click="downloadReport"
          ><ArtSvgIcon icon="ri:download-2-line" />下载更新报告</ElButton
        >
      </div>
      <p v-if="!connected" class="text-xs text-g-700"
        >当前未连接执行端，显示上次保存的报告；重新连接后再执行。</p
      >
      <div class="flex min-w-0 flex-wrap items-center gap-2">
        <ElInput
          v-model="query"
          class="min-w-40! flex-1!"
          placeholder="搜索表、函数或附件名称"
          aria-label="筛选更新项目"
          clearable
        />
        <ElSelect v-model="filter" class="w-32!" aria-label="更新项目范围"
          ><ElOption label="全部项目" value="all" /><ElOption
            label="只看变化"
            value="changed" /><ElOption label="只看跳过" value="unchanged"
        /></ElSelect>
      </div>
      <ArtTable
        :data="rows"
        :columns="columns"
        :pagination="{ current: page, size: pageSize, total: rows.length }"
        client-pagination
        :max-height="360"
        row-key="rowKey"
        size="small"
        empty-text="当前筛选下没有项目"
        empty-description="可切换到全部项目查看跳过的内容。"
        @pagination:current-change="page = $event"
        @pagination:size-change="pageSizeChanged"
      >
        <template #kind="{ row }">{{ kindLabels[row.kind as ItemKind] }}</template>
        <template #status="{ row }"
          ><ElTag :type="statusTypes[row.status as ItemStatus]" size="small">{{
            statusLabels[row.status as ItemStatus]
          }}</ElTag></template
        >
      </ArtTable>
      <div class="rounded-lg bg-g-100 p-3 text-xs leading-6 text-g-700"
        ><ul class="list-inside list-disc"
          ><li v-for="warning in report.warnings" :key="warning">{{ warning }}</li></ul
        ></div
      >
      <p v-if="report.historyPath" class="text-xs leading-5 break-all text-g-700"
        >旧文件及清单归档：{{ report.historyPath }}</p
      >
    </template>
    <ElAlert
      v-else
      title="此任务没有可显示的更新报告"
      description="请重新连接执行端后查看；旧执行端需要重新启动才能返回新的报告格式。"
      type="warning"
      show-icon
      :closable="false"
    />
  </section>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { ElMessage, type TagProps } from 'element-plus'
  import type { BackupUpdateReport } from '@/types/supabase-operations'
  import { downloadBlob } from '@/utils/file'
  const props = defineProps<{ report?: BackupUpdateReport; running: boolean; connected: boolean }>()
  const emit = defineEmits<{
    'prepare-update': [report: BackupUpdateReport]
    'prepare-check': [path: string]
  }>()
  type ItemKind = BackupUpdateReport['items'][number]['kind']
  type ItemStatus = BackupUpdateReport['items'][number]['status']
  const kindLabels: Record<ItemKind, string> = {
    table: '表数据',
    schema: '结构 / 策略',
    roles: '角色',
    migrationHistory: '历史结构',
    managedSchema: '托管结构',
    function: 'Edge Function',
    storage: '附件',
    metadata: '元数据'
  }
  const statusLabels: Record<ItemStatus, string> = {
    added: '新增',
    changed: '变化',
    removed: '移除',
    unchanged: '跳过',
    check: '需校对'
  }
  const statusTypes: Record<ItemStatus, TagProps['type']> = {
    added: 'success',
    changed: 'warning',
    removed: 'danger',
    unchanged: 'info',
    check: 'warning'
  }
  const query = ref(''),
    filter = ref('changed'),
    page = ref(1),
    pageSize = ref(30)
  watch([query, filter], () => {
    page.value = 1
  })
  const rows = computed(() =>
    (props.report?.items || [])
      .filter(
        (item) =>
          (filter.value === 'all' ||
            (filter.value === 'unchanged'
              ? item.status === 'unchanged'
              : item.status !== 'unchanged')) &&
          `${item.label} ${item.key}`.toLowerCase().includes(query.value.trim().toLowerCase())
      )
      .map((item) => ({ ...item, rowKey: `${item.kind}:${item.key}` }))
  )
  const metrics = computed(() => [
    { label: '新增', value: props.report?.summary.added || 0 },
    { label: '变化 / 待校对', value: props.report?.summary.changed || 0 },
    { label: '移除', value: props.report?.summary.removed || 0 },
    { label: '未变化，跳过', value: props.report?.summary.unchanged || 0 }
  ])
  const title = computed(
    () =>
      ({
        planned: '更新计划已生成，原备份未改动',
        unchanged: '无需下载新的内容',
        updated: '已有备份更新完成',
        failed: '本次更新未完成'
      })[props.report?.status || 'failed']
  )
  const description = computed(() =>
    props.report?.status === 'updated'
      ? '同一目录已保存校验通过的完整快照。被替换的文件和旧清单已归档。'
      : props.report?.status === 'unchanged'
        ? '比较结果没有需要重新下载的内容，现有文件已复用。'
        : '先核对变化范围，再准备并执行更新；同名但内容或版本变化的对象也会更新。'
  )
  const columns = [
    { prop: 'kind', label: '分类', width: 116, useSlot: true },
    { prop: 'label', label: '项目', minWidth: 180, showOverflowTooltip: true },
    { prop: 'status', label: '处理', width: 88, useSlot: true },
    { prop: 'detail', label: '说明', minWidth: 220, showOverflowTooltip: true }
  ]
  function pageSizeChanged(value: number): void {
    pageSize.value = value
    page.value = 1
  }
  function downloadReport(): void {
    if (!props.report) return
    try {
      downloadBlob(
        new Blob([JSON.stringify(props.report, null, 2)], {
          type: 'application/json;charset=utf-8'
        }),
        `backup-update-${props.report.planId}.json`
      )
    } catch {
      ElMessage.error('更新报告下载失败，请重试。')
    }
  }
</script>
