<template>
  <section
    class="verification-report min-w-0 shrink-0 space-y-4"
    aria-label="备份完整性校验结果"
    data-testid="operations-verification-report"
  >
    <ElAlert
      v-if="inProgress"
      :title="status === 'cancelling' ? '正在停止校验' : '正在校验文件完整性'"
      description="正在核对完成清单、文件大小和 SHA-256。完成后显示检查明细；此操作不会启动恢复。"
      type="info"
      :closable="false"
      show-icon
    />
    <template v-else-if="report">
      <div class="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div class="min-w-0 flex-1">
          <ElAlert
            :title="report.status === 'passed' ? '文件完整性校验通过' : '文件完整性校验未通过'"
            :description="
              report.status === 'passed'
                ? '已核对本地备份文件与完成清单。恢复是否成功，还需在独立环境演练。'
                : '发现缺失、损坏或不符合备份要求的内容。请查看问题明细，修复后重新校验。'
            "
            :type="report.status === 'passed' ? 'success' : 'error'"
            :closable="false"
            show-icon
          />
        </div>
        <ElButton v-auth="'SupabaseOperations:Verify'" plain @click="downloadReport">
          <ArtSvgIcon icon="ri:download-2-line" />下载校验报告
        </ElButton>
      </div>
      <p v-if="!connected" class="text-sm text-g-700" role="status">
        执行端未连接，下方为上次保存的校验结果。
      </p>
      <dl class="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg bg-g-100 p-4">
        <div>
          <dt class="text-xs text-g-700">已校验文件</dt>
          <dd class="mt-1 text-xl font-semibold text-g-900 tabular-nums">
            {{ report.summary.verifiedFiles }}/{{ report.summary.files }}
          </dd>
        </div>
        <div>
          <dt class="text-xs text-g-700">清单总大小</dt>
          <dd class="mt-1 text-xl font-semibold text-g-900 tabular-nums">
            {{ formatSize(report.summary.totalBytes, { trimZeros: true }) }}
          </dd>
        </div>
        <div>
          <dt class="text-xs text-g-700">发现问题</dt>
          <dd class="mt-1 text-sm font-medium tabular-nums">{{ report.summary.issueCount }} 项</dd>
        </div>
        <div>
          <dt class="text-xs text-g-700">校验完成时间</dt>
          <dd class="mt-1 text-sm">{{ formatDateTimeValue(report.completedAt) }}</dd>
        </div>
      </dl>
      <div class="verification-report__details min-w-0">
        <section class="min-w-0" aria-label="检查内容">
          <ArtSectionTitle title="检查内容" :show-line="false" />
          <ul class="mt-2 divide-y divide-g-200">
            <li v-for="check in report.checks" :key="check.id" class="flex items-start gap-3 py-2">
              <ElTag :type="checkType(check.status)" size="small" class="mt-0.5 shrink-0">
                {{ checkLabel(check.status) }}
              </ElTag>
              <div class="min-w-0">
                <p class="text-sm font-medium text-g-900">{{ check.label }}</p>
                <p class="mt-1 text-xs leading-5 break-words text-g-700">{{ check.detail }}</p>
              </div>
            </li>
          </ul>
        </section>
        <section class="min-w-0" aria-label="文件分类">
          <ArtSectionTitle title="文件分类" :show-line="false" />
          <ArtTable
            class="mt-3"
            :data="report.groups"
            :columns="groupColumns"
            :pagination="false"
            :max-height="300"
            size="small"
          >
            <template #bytes="{ row }">{{ formatSize(row.bytes, { trimZeros: true }) }}</template>
          </ArtTable>
          <dl class="mt-4 space-y-2 text-xs leading-5 text-g-700">
            <div>
              <dt class="font-medium text-g-800">备份生成时间</dt>
              <dd>{{ formatDateTimeValue(report.snapshotCreatedAt) }}</dd>
            </div>
            <div>
              <dt class="font-medium text-g-800">来源项目</dt>
              <dd class="break-all">{{ report.sourceProjectRef || '无法确认' }}</dd>
            </div>
          </dl>
        </section>
      </div>
      <ElCollapse v-if="report.summary.issueCount > 0" v-model="expandedIssues">
        <ElCollapseItem name="issues" :title="`问题明细（${report.summary.issueCount} 项）`">
          <ElScrollbar max-height="260px" aria-label="校验问题明细">
            <ul class="space-y-3 pr-3">
              <li v-for="(issue, index) in report.issues" :key="`${issue.code}-${index}`">
                <p class="text-sm text-g-900">{{ issue.message }}</p>
                <code v-if="issue.path" class="mt-1 block text-xs leading-5 break-all text-g-700">
                  {{ issue.path }}
                </code>
              </li>
            </ul>
          </ElScrollbar>
          <p
            v-if="report.summary.issueCount > report.issues.length"
            class="mt-2 text-xs text-g-700"
          >
            已列出前 {{ report.issues.length }} 项；本次共发现
            {{ report.summary.issueCount }} 项问题。
          </p>
        </ElCollapseItem>
      </ElCollapse>
      <div class="rounded-lg bg-g-100 p-3 text-xs leading-6 text-g-700">
        <p class="font-medium text-g-900">本次校验的范围</p>
        <ul class="list-inside list-disc">
          <li v-for="limitation in report.limitations" :key="limitation">{{ limitation }}</li>
        </ul>
      </div>
    </template>
    <ElAlert
      v-else
      :title="status === 'succeeded' ? '此历史任务未保存校验明细' : '本次校验未生成完整报告'"
      description="旧记录只有执行日志，无法展示当时的逐项结论。可沿用原目录重新校验；不会创建备份或启动恢复。"
      type="warning"
      :closable="false"
      show-icon
    >
      <ElButton
        v-auth="'SupabaseOperations:Verify'"
        class="mt-2"
        size="small"
        plain
        @click="emit('prepare-retry')"
        >准备重新校验</ElButton
      >
    </ElAlert>
  </section>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { ElMessage, type TagProps } from 'element-plus'
  import type { BackupVerificationReport, OperationStatus } from '@/types/supabase-operations'
  import { downloadBlob } from '@/utils/file'
  import { formatSize } from '@/utils/file/format-size'
  import { formatDateTimeValue } from '@/utils/ui/format'

  const props = defineProps<{
    report?: BackupVerificationReport
    status: OperationStatus
    connected: boolean
    runId: string
  }>()
  const emit = defineEmits<{ 'prepare-retry': [] }>()
  const inProgress = computed(() => ['running', 'cancelling'].includes(props.status))
  const expandedIssues = ref<string[]>([])
  const groupColumns = [
    { prop: 'label', label: '文件分类', minWidth: 100 },
    { prop: 'verifiedFiles', label: '已校验', width: 74, align: 'right' as const },
    { prop: 'files', label: '总数', width: 64, align: 'right' as const },
    { prop: 'bytes', label: '体积', minWidth: 100, useSlot: true, align: 'right' as const }
  ]
  type CheckStatus = BackupVerificationReport['checks'][number]['status']
  function checkType(status: CheckStatus): TagProps['type'] {
    const types: Record<CheckStatus, TagProps['type']> = {
      passed: 'success',
      failed: 'danger',
      warning: 'warning',
      skipped: 'info'
    }
    return types[status]
  }
  function checkLabel(status: CheckStatus): string {
    return { passed: '通过', failed: '未通过', warning: '需关注', skipped: '未执行' }[status]
  }
  function downloadReport(): void {
    if (!props.report) return
    try {
      downloadBlob(
        new Blob([JSON.stringify(props.report, null, 2)], {
          type: 'application/json;charset=utf-8'
        }),
        `backup-verification-${props.runId}.json`
      )
    } catch {
      ElMessage.error('校验报告下载失败，请重试。')
    }
  }
</script>

<style scoped lang="scss">
  .verification-report {
    container-type: inline-size;

    &__details {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 16px;

      @container (min-width: 44rem) {
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      }
    }
  }
</style>
