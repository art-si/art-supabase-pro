<template>
  <ArtPageShell class="supabase-operations-shell" full-height>
    <div class="supabase-operations art-full-height" :class="{ 'is-focus-mode': focusMode }">
      <BusinessWorkspaceHeader
        v-if="!focusMode"
        density="compact"
        title="Supabase 运维台"
        description="从远端快照到本地恢复，逐步查看执行状态、等待原因与可校验产物。"
        icon="ri:tools-line"
        :tags="[
          {
            label: workspace.connected.value ? '执行端已连接' : '执行端未连接',
            type: workspace.connected.value ? 'success' : 'info'
          },
          { label: OPERATIONS_PROJECT_REF, type: 'info' }
        ]"
      />
      <ElAlert
        v-if="!isPlatformSuper"
        title="项目级运维需要平台超级管理员身份。AI 助手的普通用户能力仍可正常使用。"
        type="warning"
        :closable="false"
        show-icon
      />
      <template v-else>
        <section
          class="art-card-xs flex shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-3"
          aria-label="本机执行端连接"
          v-show="!focusMode"
          data-testid="operations-connection"
        >
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-3 text-sm">
              <strong class="font-medium text-g-900">本机执行端</strong>
              <button
                type="button"
                class="art-icon-label rounded bg-primary/10 px-3 py-2 text-primary hover:bg-primary/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                aria-label="复制启动命令 pnpm supabase:ops"
                @click="copyStartupCommand"
                ><code>pnpm supabase:ops</code><ArtSvgIcon icon="ri:file-copy-line" /><span
                  class="text-xs"
                  >{{ startupCopied ? '已复制' : '点击复制' }}</span
                ></button
              >
            </div>
            <p class="mt-1 text-xs leading-5 text-g-700"
              >在仓库终端运行并保持窗口开启；无需配对码，环境检查可选。</p
            >
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <ElButton plain @click="usageGuideRef?.handleOpen(selectedOperation.id)"
              ><ArtSvgIcon icon="ri:question-line" />使用说明</ElButton
            >
            <label class="flex items-center gap-2 text-xs text-g-700"
              >端口<ElInputNumber
                v-model="workspace.connection.value.port"
                :min="1024"
                :max="65535"
                :controls="false"
                class="w-24!"
            /></label>
            <ElButton
              v-auth="'SupabaseOperations:Read'"
              type="primary"
              plain
              :loading="workspace.connecting.value"
              @click="ensureConnected(true)"
              >{{ workspace.connected.value ? '重新连接' : '连接执行端' }}</ElButton
            >
            <span v-if="workspace.checkedAt.value" class="text-xs text-g-600"
              >{{ workspace.connected.value ? '最近响应' : '上次连接' }}
              {{ secondsSince(workspace.checkedAt.value) }} 秒前</span
            >
          </div>
          <ElAlert
            v-if="workspace.error.value"
            :title="workspace.error.value"
            type="error"
            :closable="false"
            show-icon
            class="basis-full"
          />
        </section>
        <ElAlert
          v-if="
            workspace.connected.value &&
            workspace.externalActivity.value &&
            workspace.selectedRun.value?.status !== 'interrupted'
          "
          :title="workspace.externalActivity.value.message"
          type="warning"
          :closable="false"
          show-icon
          class="shrink-0"
        />
        <section class="operations-workspace">
          <ArtSectionCard
            title="运维操作"
            v-show="!focusMode"
            subtitle="选择任务后填写参数"
            body-class="operations-catalog"
          >
            <nav aria-label="Supabase 运维操作" class="flex flex-col gap-1">
              <button
                v-for="operation in operationList"
                :key="operation.id"
                type="button"
                class="operations-choice"
                :class="{ 'is-selected': operation.id === selectedOperation.id }"
                :aria-pressed="operation.id === selectedOperation.id"
                @click="chooseOperation(operation)"
              >
                <span class="font-medium">{{ operation.title }}</span>
                <span class="text-xs text-g-600">{{
                  operation.risk === 'remote'
                    ? '写入独立云项目'
                    : operation.risk === 'local'
                      ? '本机操作'
                      : '读取与校验'
                }}</span>
              </button>
            </nav>
          </ArtSectionCard>
          <ElScrollbar
            class="h-full min-h-0 min-w-0"
            view-class="h-full"
            data-testid="operations-workspace-scroll"
          >
            <div class="operations-main">
              <ArtSectionCard
                v-show="!focusMode"
                :key="selectedOperation.id"
                :title="selectedOperation.title"
                :subtitle="selectedOperation.description"
                class="operations-parameters"
              >
                <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p class="min-w-0 break-all text-xs text-g-600">{{ selectedOperation.script }}</p>
                  <ElButton
                    text
                    type="primary"
                    size="small"
                    @click="usageGuideRef?.handleOpen(selectedOperation.id)"
                    >本功能怎么用</ElButton
                  >
                </div>
                <ElAlert
                  v-if="selectedOperation.id === 'resumeBackup'"
                  title="续跑本次备份：校验后跳过完整 SQL 和可复用函数；未完成 SQL 需密码重做。后续新增数据需单独的版本增量更新。"
                  type="warning"
                  :closable="false"
                  show-icon
                  class="mb-3"
                />
                <ElAlert
                  v-if="selectedOperation.risk === 'remote'"
                  title="此操作将写入目标云项目。请核对目标项目与数据分发范围。"
                  type="warning"
                  show-icon
                  :closable="false"
                  class="mb-3"
                />
                <div ref="parametersRoot">
                  <ArtForm
                    ref="formRef"
                    root-class="p-0!"
                    v-model="parameters"
                    :items="formItems"
                    :rules="formRules"
                    :span="24"
                    label-position="top"
                    :show-reset="false"
                    :show-submit="false"
                    :disabled="workspace.submitting.value"
                  />
                </div>
                <p v-if="!selectedOperation.fields.length" class="py-4 text-sm text-g-700"
                  >无需填写参数，执行后会逐步展示检查或下载结果。</p
                >
                <ElCheckbox
                  v-if="selectedOperation.risk === 'remote'"
                  v-model="confirmed"
                  class="my-3"
                  >我已核对目标项目与本次操作范围</ElCheckbox
                >
                <p
                  v-if="operationNeedsInspectionAfterCancel(selectedOperation)"
                  class="my-2 text-xs leading-5 text-g-700"
                  >中止后需核对 Docker 和目标环境；已完成的写入不会自动回滚。</p
                >
                <div class="flex flex-wrap items-center gap-2 py-3">
                  <ElButton
                    type="primary"
                    :disabled="
                      (workspace.connected.value && workspace.busy.value) ||
                      workspace.cancelling.value ||
                      !canExecute ||
                      externalStatusBlocksOperation
                    "
                    :loading="
                      workspace.submitting.value ||
                      workspace.connecting.value ||
                      (workspace.connected.value && !parametersReady)
                    "
                    aria-describedby="operations-execution-hint"
                    @click="execute"
                    ><ArtSvgIcon icon="ri:play-line" />{{
                      workspace.connected.value
                        ? `执行${selectedOperation.title}`
                        : '连接并查看任务'
                    }}</ElButton
                  >
                  <span id="operations-execution-hint" class="text-xs text-g-600" role="status">{{
                    executionHint
                  }}</span>
                </div>
                <p v-if="selectedOperation.id === 'verify'" class="text-xs leading-5 text-g-600">
                  只读取本地备份，报告保存在备份目录外。不访问远端，不启动 Docker，也不导入数据。
                </p>
                <p v-else class="text-xs leading-5 text-g-600"
                  >密码只用于本次执行，不写入任务历史。关闭网页后任务继续；执行端退出会中断主流程，重新连接后可核对状态。</p
                >
              </ArtSectionCard>
              <ArtSectionCard
                :empty="!workspace.selectedRun.value"
                :empty-title="workspace.connected.value ? '暂无任务记录' : '连接后恢复任务状态'"
                :empty-description="
                  workspace.connected.value
                    ? '选择左侧操作并填写参数，即可发起任务。'
                    : '页面刷新不代表任务结束。请先连接执行端，恢复任务记录和实时阶段；此时不会新建备份。'
                "
                class="operations-task flex min-h-0 flex-col"
                body-class="flex min-h-full flex-col gap-3"
                data-testid="operations-task"
              >
                <template #header>
                  <header
                    class="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3 px-5 pt-5"
                  >
                    <div class="flex flex-wrap items-center gap-3">
                      <ArtSectionTitle class="m-0! w-auto! shrink-0" :show-line="false"
                        >执行任务</ArtSectionTitle
                      >
                      <ElTag
                        :type="taskIndicator.tone"
                        effect="light"
                        round
                        class="art-icon-label"
                        role="status"
                        :aria-label="`任务状态：${taskIndicator.label}`"
                        data-testid="operations-task-status"
                      >
                        <span class="art-icon-label"
                          ><span
                            class="size-2 shrink-0 rounded-full bg-current"
                            :class="{ 'operations-running-dot': taskIndicator.pulse }"
                            aria-hidden="true"
                          />
                          {{ taskIndicator.label }}</span
                        >
                      </ElTag>
                    </div>
                    <div class="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
                      <ElSelect
                        v-if="workspace.runs.value.length"
                        v-model="workspace.selectedRunId.value"
                        class="max-w-full! min-w-40! flex-[0_1_240px] 2xl:flex-[0_1_300px]"
                        aria-label="选择任务历史"
                        placeholder="任务历史"
                      >
                        <ElOption
                          v-for="run in workspace.runs.value"
                          :key="run.id"
                          :value="run.id"
                          :label="`${run.title} · ${OPERATION_STATUS_LABELS[run.status]} · ${formatDateTimeValue(run.startedAt)}`"
                        />
                      </ElSelect>
                      <ElButton
                        v-auth="'SupabaseOperations:Read'"
                        text
                        :loading="refreshingTasks"
                        @click="refreshTasks"
                        ><ArtSvgIcon icon="ri:refresh-line" />刷新</ElButton
                      >
                      <BusinessWorkspaceFocusToggle v-model="focusMode" />
                    </div>
                  </header>
                </template>
                <template v-if="workspace.selectedRun.value">
                  <ElAlert
                    v-if="viewingHistoryWhileRunning"
                    :title="`当前正在执行：${workspace.currentRun.value?.title} · ${workspace.currentRun.value?.stage}。下方是历史记录。`"
                    type="info"
                    :closable="false"
                    show-icon
                    class="shrink-0"
                  >
                    <ElButton
                      class="mt-2"
                      size="small"
                      type="primary"
                      plain
                      @click="workspace.selectedRunId.value = workspace.currentRun.value?.id || ''"
                      >查看正在运行的任务</ElButton
                    >
                  </ElAlert>
                  <div class="flex shrink-0 flex-wrap items-start justify-between gap-3">
                    <div class="min-w-0"
                      ><strong class="text-base">{{ workspace.selectedRun.value.title }}</strong
                      ><p class="mt-1 text-xs text-g-600"
                        >{{ formatDateTimeValue(workspace.selectedRun.value.startedAt) }} ·
                        {{
                          workspace.selectedRun.value.status === 'interrupted'
                            ? '主流程已中断，时长待核对'
                            : `已运行 ${elapsed}`
                        }}</p
                      ></div
                    >
                    <ElTag :type="statusType">{{ selectedStatusLabel }}</ElTag>
                  </div>
                  <div class="operations-stage shrink-0" role="status"
                    ><strong>{{ selectedStage }}</strong
                    ><span>{{
                      !workspace.connected.value
                        ? '最后已知状态，尚未确认任务是否结束'
                        : running
                          ? `最近输出 ${secondsSince(workspace.selectedRun.value.lastOutputAt)} 秒前`
                          : workspace.selectedRun.value.status === 'interrupted'
                            ? workspace.externalActivity.value?.state === 'running'
                              ? '旧导出仍在运行，主流程未完成'
                              : workspace.externalActivity.value?.state === 'unknown'
                                ? '每 5 秒自动核对 Docker 状态'
                                : viewingHistoryWhileRunning
                                  ? '当前显示历史记录，另有任务正在执行'
                                  : '当前没有任务运行，此次任务未完成'
                            : '任务已结束，结果及日志保留在本机'
                    }}</span></div
                  >
                  <ElAlert
                    v-if="
                      workspace.connected.value &&
                      running &&
                      secondsSince(workspace.selectedRun.value.lastOutputAt) >= 30
                    "
                    title="任务暂时没有新输出。进程仍在执行，可能正在下载、校验或等待网络；可查看日志或取消，界面不会虚报完成。"
                    type="warning"
                    :closable="false"
                    show-icon
                    class="shrink-0"
                  />
                  <ElAlert
                    v-if="interruptedRecovery"
                    :title="interruptedRecovery.title"
                    type="warning"
                    :closable="false"
                    show-icon
                    class="shrink-0"
                    data-testid="operations-interrupted-recovery"
                  >
                    <p class="mt-1 text-sm leading-6">{{ interruptedRecovery.description }}</p>
                    <div class="mt-3 flex flex-wrap gap-2">
                      <ElButton
                        v-auth="'SupabaseOperations:Read'"
                        size="small"
                        :loading="refreshingTasks"
                        @click="refreshTasks"
                        >重新核对状态</ElButton
                      >
                      <ElButton
                        v-if="workspace.externalActivity.value?.state === 'running'"
                        v-auth="'SupabaseOperations:Cancel'"
                        size="small"
                        type="danger"
                        plain
                        :loading="workspace.cancelling.value"
                        @click="stopOldExport"
                        >停止旧导出</ElButton
                      >
                      <template v-if="!workspace.externalActivity.value && !workspace.busy.value">
                        <ElButton
                          v-auth="'SupabaseOperations:Backup'"
                          size="small"
                          type="primary"
                          @click="prepareRecovery('backup')"
                          >填写密码重新备份</ElButton
                        >
                        <ElButton
                          v-auth="'SupabaseOperations:ResumeBackup'"
                          size="small"
                          @click="prepareRecovery('resumeBackup')"
                          >填写目录尝试续跑</ElButton
                        >
                      </template>
                    </div>
                  </ElAlert>
                  <ElAlert
                    v-else-if="workspace.selectedRun.value.error"
                    :title="workspace.selectedRun.value.error"
                    type="error"
                    :closable="false"
                    show-icon
                    class="shrink-0"
                  />
                  <div v-if="selectedArtifacts.length" class="flex shrink-0 flex-col gap-2">
                    <div
                      v-for="artifact in selectedArtifacts"
                      :key="artifact.value"
                      class="min-w-0"
                    >
                      <p class="text-xs text-g-600">{{ artifact.label }}</p>
                      <div class="flex min-w-0 items-center gap-2"
                        ><code class="min-w-0 flex-1 truncate text-sm" :title="artifact.value">{{
                          artifact.value
                        }}</code
                        ><ElButton text size="small" @click="copyArtifact(artifact.value)"
                          >复制</ElButton
                        ></div
                      >
                    </div>
                  </div>
                  <div class="flex shrink-0 flex-wrap items-center gap-2">
                    <ElButton
                      v-if="running"
                      v-auth="'SupabaseOperations:Cancel'"
                      type="danger"
                      plain
                      size="small"
                      :loading="workspace.cancelling.value"
                      :disabled="workspace.selectedRun.value.status === 'cancelling'"
                      @click="cancelTask"
                      >{{
                        workspace.selectedRun.value.status === 'cancelling'
                          ? '正在停止…'
                          : '取消任务'
                      }}</ElButton
                    >
                    <ElButton
                      v-auth="'SupabaseOperations:Read'"
                      plain
                      size="small"
                      @click="prepareRetry"
                      >复用参数</ElButton
                    >
                  </div>
                  <OperationsVerificationReport
                    v-if="workspace.selectedRun.value.operationId === 'verify'"
                    :key="workspace.selectedRun.value.id"
                    :report="workspace.selectedRun.value.verificationReport"
                    :status="workspace.selectedRun.value.status"
                    :connected="workspace.connected.value"
                    :run-id="workspace.selectedRun.value.id"
                    @prepare-retry="prepareRetry"
                  />
                  <OperationsTerminalPanel
                    :logs="workspace.selectedRun.value.logs"
                    :run-id="workspace.selectedRun.value.id"
                    :running="workspace.connected.value && running"
                  />
                </template>
              </ArtSectionCard>
            </div>
          </ElScrollbar>
        </section>
        <OperationsUsageGuide ref="usageGuideRef" />
      </template>
    </div>
  </ArtPageShell>
</template>

<script setup lang="ts">
  import { computed, ref, nextTick, onBeforeUnmount } from 'vue'
  import { storeToRefs } from 'pinia'
  import { ElMessage } from 'element-plus'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import type { FormRules } from 'element-plus'
  import { useUserStore } from '@/store/modules/user'
  import { useAuth } from '@/hooks/core/useAuth'
  import {
    SUPABASE_OPERATIONS,
    OPERATIONS_PROJECT_REF,
    OPERATION_STATUS_LABELS,
    findSupabaseOperation,
    operationNeedsInspectionAfterCancel
  } from '@/utils/supabase/operations-catalog'
  import type { SupabaseOperation, SupabaseOperationId } from '@/types/supabase-operations'
  import { formatDateTimeValue, formatDurationMs } from '@/utils/ui/format'
  import { useOperationsWorkspace } from './modules/use-operations-workspace'
  import { copyTextToClipboard } from '@/utils/file/clipboard'
  import { focusFirstInvalidFormField } from '@/utils/form/validation'
  import OperationsTerminalPanel from './modules/operations-terminal-panel.vue'
  import OperationsVerificationReport from './modules/operations-verification-report.vue'
  import { validateOperationInput } from '@/utils/supabase/operations-input'
  import { getOperationBackupPath } from '@/utils/supabase/operations-log'
  import { useWorkspaceFocus } from '@/hooks/core/useWorkspaceFocus'
  import type { TagProps } from 'element-plus'
  import { until } from '@vueuse/core'
  import OperationsUsageGuide from './modules/operations-usage-guide.vue'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  defineOptions({ name: 'SupabaseOperations' })
  const { isPlatformSuper } = storeToRefs(useUserStore())
  const { hasAuth } = useAuth()
  const { confirm } = useArtFeedback()
  const { focusMode } = useWorkspaceFocus()
  const usageGuideRef = ref<{ handleOpen: (operationId?: SupabaseOperationId) => void }>()
  const workspace = useOperationsWorkspace(
    computed(() => isPlatformSuper.value && hasAuth('SupabaseOperations:Read'))
  )
  const externalStatusBlocksOperation = computed(
    () =>
      workspace.connected.value &&
      workspace.externalActivity.value?.state === 'unknown' &&
      operationNeedsInspectionAfterCancel(selectedOperation.value)
  )
  const startupCopied = ref(false)
  let copyFeedbackTimer: ReturnType<typeof setTimeout> | undefined
  onBeforeUnmount(() => clearTimeout(copyFeedbackTimer))
  const refreshingTasks = ref(false)
  const executionHint = computed(() =>
    workspace.connected.value && !parametersReady.value
      ? '参数控件正在加载，请稍候。'
      : !workspace.connected.value
        ? '先恢复连接查看已有任务；此按钮只查看状态，不会创建新任务。'
        : workspace.externalActivity.value
          ? workspace.externalActivity.value.message
          : workspace.busy.value
            ? workspace.connected.value
              ? '当前有任务正在执行，完成或中止后可发起下一项。'
              : '任务状态待确认，请先点击刷新核对，暂不重复发起。'
            : !canExecute.value
              ? '当前账号没有此操作权限，请联系平台管理员。'
              : selectedOperation.value.risk === 'remote' && !confirmed.value
                ? '请核对目标项目并勾选确认，再执行本次操作。'
                : '填写参数后即可执行，环境检查不是前置条件。'
  )
  const backupOperation = findSupabaseOperation('backup') || SUPABASE_OPERATIONS[0]
  const operationList = [
    backupOperation,
    ...SUPABASE_OPERATIONS.filter((item) => item.id !== backupOperation.id)
  ]
  const selectedOperation = ref(backupOperation)
  const selectedArtifacts = computed(() => {
    const artifacts = workspace.selectedRun.value?.artifacts || []
    const backupPath = getOperationBackupPath(workspace.selectedRun.value)
    return backupPath && !artifacts.some((item) => item.value === backupPath)
      ? [
          {
            label: '实际备份目录（可复制用于续跑或校验）',
            value: backupPath,
            kind: 'path' as const
          },
          ...artifacts
        ]
      : artifacts
  })
  const parameters = ref<Record<string, string | boolean>>({})
  const confirmed = ref(false)
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const parametersRoot = ref<HTMLElement>()
  const parametersReady = computed(() => Boolean(formRef.value?.controlsReady))
  const formItems = computed<FormItem[]>(() =>
    selectedOperation.value.fields.map((field) => ({
      key: field.key,
      label: field.label,
      type: field.kind === 'switch' ? 'switch' : 'input',
      span: 24,
      help: field.help,
      props:
        field.kind === 'switch'
          ? {}
          : {
              type: field.kind === 'secret' ? 'password' : 'text',
              showPassword: field.kind === 'secret',
              autocomplete: 'off',
              placeholder: field.placeholder || `请输入${field.label}`
            }
    }))
  )
  const formRules = computed<FormRules>(() =>
    Object.fromEntries(
      selectedOperation.value.fields
        .filter(
          (field) =>
            field.required ||
            (field.key === 'DbPassword' &&
              selectedOperation.value.id === 'resumeBackup' &&
              ['failed', 'interrupted', 'cancelled'].includes(
                workspace.selectedRun.value?.status || ''
              ) &&
              /导出数据库|处理数据库|导出迁移|导出托管/.test(
                workspace.selectedRun.value?.stage || ''
              ) &&
              parameters.value.ResumeBackupPath ===
                getOperationBackupPath(workspace.selectedRun.value))
        )
        .map((field) => [
          field.key,
          [{ required: true, message: `请填写${field.label}`, trigger: 'blur' }]
        ])
    )
  )
  const canExecute = computed(
    () =>
      isPlatformSuper.value &&
      {
        diagnose: hasAuth('SupabaseOperations:Diagnose'),
        syncFunctions: hasAuth('SupabaseOperations:SyncFunctions'),
        backup: hasAuth('SupabaseOperations:Backup'),
        resumeBackup: hasAuth('SupabaseOperations:ResumeBackup'),
        verify: hasAuth('SupabaseOperations:Verify'),
        package: hasAuth('SupabaseOperations:Package'),
        download: hasAuth('SupabaseOperations:Download'),
        restoreLocal: hasAuth('SupabaseOperations:RestoreLocal'),
        resumeLocal: hasAuth('SupabaseOperations:ResumeLocal'),
        restoreRemote: hasAuth('SupabaseOperations:RestoreRemote'),
        publish: hasAuth('SupabaseOperations:Publish'),
        setLocalLogin: hasAuth('SupabaseOperations:SetLocalLogin')
      }[selectedOperation.value.id]
  )
  const running = computed(() =>
    ['running', 'cancelling'].includes(workspace.selectedRun.value?.status || '')
  )
  const viewingHistoryWhileRunning = computed(
    () =>
      workspace.currentRun.value && workspace.currentRun.value.id !== workspace.selectedRunId.value
  )
  const selectedStatusLabel = computed(() => {
    const run = workspace.selectedRun.value
    if (!workspace.connected.value || !run) return '状态待确认'
    if (run.status === 'interrupted' && !workspace.externalActivity.value && !workspace.busy.value)
      return '已停止，未完成'
    return OPERATION_STATUS_LABELS[run.status]
  })
  const selectedStage = computed(() => {
    if (workspace.externalActivity.value) return workspace.externalActivity.value.stage
    const run = workspace.selectedRun.value
    return run?.status === 'interrupted' ? `中断于：${run.stage}` : run?.stage
  })
  const interruptedRecovery = computed(() => {
    if (
      !workspace.connected.value ||
      viewingHistoryWhileRunning.value ||
      workspace.selectedRun.value?.status !== 'interrupted'
    )
      return null
    const activity = workspace.externalActivity.value
    if (activity?.state === 'running')
      return {
        title: '旧数据库导出仍在运行，暂不能重新备份',
        description:
          '主执行端已退出，无法自动接管旧导出。可等待导出结束，或点击“停止旧导出”后重新创建备份。此处只停止本项目遗留的数据库导出；当前不支持接续未完成的数据库导出。'
      }
    if (activity?.state === 'unknown')
      return {
        title: '先恢复 Docker 连接，再开始下一次备份',
        description: `${activity.message} 系统每 5 秒自动重试，也可点“重新核对状态”；确认旧导出不再运行后，会显示重新备份和续跑入口。`
      }
    return {
      title: '已确认没有旧数据库导出运行，可以选择下一步',
      description:
        '可填写原目录完成这次备份：完整 SQL 和已校验的函数文件可复用；数据库未完成时才需要密码。后续新增数据的跨版本更新另需增量包。以下按钮只准备表单，不会立即执行。'
    }
  })
  const taskIndicator = computed<{ label: string; tone: TagProps['type']; pulse: boolean }>(() => {
    if (!workspace.connected.value)
      return {
        label: workspace.connecting.value ? '正在恢复连接' : '状态待确认',
        tone: 'warning',
        pulse: false
      }
    const external = workspace.externalActivity.value
    if (external?.state === 'unknown')
      return { label: '导出状态待核对', tone: 'warning', pulse: false }
    const run = workspace.selectedRun.value
    if (
      (running.value || external?.state === 'running') &&
      secondsSince(workspace.checkedAt.value) > 15
    )
      return { label: '运行状态待刷新', tone: 'warning', pulse: false }
    if (external?.state === 'running')
      return { label: '后台导出运行中', tone: 'success', pulse: true }
    if (run?.status === 'running') return { label: '正在执行', tone: 'success', pulse: true }
    if (run?.status === 'failed') return { label: '执行失败', tone: 'danger', pulse: false }
    if (run?.status === 'succeeded') return { label: '执行完成', tone: 'success', pulse: false }
    if (run?.status === 'cancelling') return { label: '正在停止', tone: 'warning', pulse: false }
    if (run?.status === 'interrupted')
      return { label: '已停止，任务未完成', tone: 'warning', pulse: false }
    return { label: run ? '已取消' : '等待任务', tone: 'info', pulse: false }
  })
  const statusType = computed(() =>
    workspace.selectedRun.value?.status === 'succeeded'
      ? 'success'
      : workspace.selectedRun.value?.status === 'failed'
        ? 'danger'
        : running.value
          ? 'primary'
          : 'info'
  )
  const elapsed = computed(() =>
    workspace.selectedRun.value
      ? formatDurationMs(
          (workspace.selectedRun.value.endedAt
            ? Date.parse(workspace.selectedRun.value.endedAt)
            : workspace.now.value) - Date.parse(workspace.selectedRun.value.startedAt)
        )
      : '--'
  )
  function secondsSince(value: number | string): number {
    return Math.max(
      0,
      Math.floor(
        (workspace.now.value - (typeof value === 'string' ? Date.parse(value) : value)) / 1000
      )
    )
  }
  function chooseOperation(operation: SupabaseOperation): void {
    selectedOperation.value = operation
    parameters.value = Object.fromEntries(
      operation.fields.filter((field) => field.kind === 'switch').map((field) => [field.key, false])
    )
    confirmed.value = false
    if (operation.id === 'resumeBackup') {
      const backupPath = getOperationBackupPath(workspace.selectedRun.value)
      if (backupPath) parameters.value.ResumeBackupPath = backupPath
    }
  }
  async function execute(): Promise<void> {
    if (workspace.submitting.value || workspace.connecting.value) return
    if (!workspace.connected.value) {
      if (await ensureConnected())
        ElMessage.info(
          workspace.busy.value ? '已恢复现有任务，请查看右侧状态' : '已连接，填写参数后可执行任务'
        )
      return
    }
    if (workspace.busy.value || externalStatusBlocksOperation.value) return
    if (!canExecute.value) {
      ElMessage.warning('当前账号没有此操作权限')
      return
    }
    if (!parametersReady.value) {
      ElMessage.info('参数控件正在加载，请稍候再执行')
      return
    }
    try {
      if ((await formRef.value?.validate()) === false) {
        await nextTick()
        focusFirstInvalidFormField(parametersRoot)
        return
      }
    } catch {
      await nextTick()
      focusFirstInvalidFormField(parametersRoot)
      if (!parametersRoot.value?.querySelector('.el-form-item.is-error'))
        ElMessage.warning('参数校验未完成，请检查表单，或重新选择操作后重试')
      return
    }
    if (selectedOperation.value.risk === 'remote' && !confirmed.value) {
      ElMessage.warning('请核对目标项目并勾选确认后再执行')
      return
    }
    try {
      validateOperationInput(selectedOperation.value, parameters.value)
    } catch (cause) {
      ElMessage.warning(cause instanceof Error ? cause.message : '请检查本次操作的参数')
      return
    }
    if (!(await ensureConnected())) return
    if (await workspace.start(selectedOperation.value, parameters.value)) {
      for (const field of selectedOperation.value.fields)
        if (field.kind === 'secret') parameters.value[field.key] = ''
      await nextTick()
      formRef.value?.clearValidate()
      confirmed.value = false
      ElMessage.success('任务已提交，可在右侧查看执行状态')
    }
  }
  async function ensureConnected(force = false): Promise<boolean> {
    if (workspace.connected.value && !force) return true
    await workspace.connect()
    return workspace.connected.value
  }
  async function refreshTasks(): Promise<void> {
    if (refreshingTasks.value) return
    refreshingTasks.value = true
    try {
      await ensureConnected(true)
    } finally {
      refreshingTasks.value = false
    }
  }
  async function cancelTask(): Promise<void> {
    if (!(await ensureConnected())) return
    if (!running.value) {
      ElMessage.info('已更新任务状态，请核对执行结果')
      return
    }
    await workspace.cancel()
  }
  async function copyArtifact(value: string): Promise<boolean> {
    try {
      await copyTextToClipboard(value)
      ElMessage.success('已复制')
      return true
    } catch {
      ElMessage.warning('复制失败，请手动选择文字复制，或检查剪贴板权限')
      return false
    }
  }
  async function copyStartupCommand(): Promise<void> {
    if (!(await copyArtifact('pnpm supabase:ops'))) return
    startupCopied.value = true
    clearTimeout(copyFeedbackTimer)
    copyFeedbackTimer = setTimeout(() => {
      startupCopied.value = false
    }, 2000)
  }
  function prepareRetry(): void {
    const run = workspace.selectedRun.value
    const operation = findSupabaseOperation(run?.operationId)
    if (!run || !operation) return
    chooseOperation(operation)
    parameters.value = { ...parameters.value, ...run.parameters }
    ElMessage.info('已复用非敏感参数，请补全密码并核对后执行')
  }
  async function prepareRecovery(id: 'backup' | 'resumeBackup'): Promise<void> {
    const operation = findSupabaseOperation(id)
    if (!operation || workspace.externalActivity.value || workspace.busy.value) return
    focusMode.value = false
    chooseOperation(operation)
    // Let the keyed parameter card replace the previous form before waiting for its controls.
    await nextTick()
    await until(parametersReady).toBe(true, { timeout: 10_000, throwOnTimeout: false })
    await nextTick()
    parametersRoot.value?.querySelector<HTMLInputElement>('input:not([type="hidden"])')?.focus()
    ElMessage.info(
      id === 'backup'
        ? '请填写密码，再点击执行重新备份'
        : '请核对原备份目录；数据库文件未完成时输入来源数据库密码，再点击执行续跑'
    )
  }
  async function stopOldExport(): Promise<void> {
    if (workspace.cancelling.value || workspace.externalActivity.value?.state !== 'running') return
    try {
      await confirm(
        '停止后，当前 SQL 文件不能按字节续传；可在原备份目录重新导出未完成的文件，已校验完整的文件会保留。确定停止本项目的旧导出吗？',
        {
          title: '停止旧数据库导出',
          confirmButtonText: '停止旧导出',
          confirmButtonType: 'danger',
          cancelButtonText: '继续等待',
          closeOnClickModal: false
        }
      )
    } catch {
      return
    }
    if (await workspace.stopDetachedExports())
      ElMessage.success('旧导出已停止，可填写原备份目录和数据库密码继续未完成的备份')
  }
</script>

<style scoped lang="scss">
  .supabase-operations {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  .operations-workspace {
    display: grid;
    flex: 1;
    grid-template-rows: minmax(0, 1fr);
    grid-template-columns: 196px minmax(0, 1fr);
    gap: 12px;
    min-height: 0;
    overflow: hidden;
  }

  .operations-main {
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    grid-template-columns: minmax(320px, 380px) minmax(0, 1fr);
    gap: 12px;
    min-width: 0;
    height: 100%;
    min-height: 0;
  }

  .operations-choice {
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 100%;
    padding: 10px 12px;
    text-align: left;
    border-radius: var(--el-border-radius-base);

    &:hover {
      background: var(--art-gray-100);
    }

    &:focus-visible {
      outline: 2px solid var(--theme-color);
      outline-offset: -2px;
    }

    &.is-selected {
      color: var(--theme-color);
      background: var(--el-color-primary-light-9);
    }
  }

  .operations-stage {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 16px;
    align-items: center;
    justify-content: space-between;
    padding: 12px;
    background: var(--art-gray-100);
    border-radius: var(--el-border-radius-base);

    span {
      font-size: 12px;
      color: var(--art-gray-600);
    }
  }

  @media (width <= 1150px) {
    .operations-main {
      grid-template-rows: minmax(460px, auto) minmax(460px, 1fr);
      grid-template-columns: minmax(0, 1fr);
    }

    .operations-task {
      min-height: 460px;
    }
  }

  @media (width <= 800px) {
    .operations-workspace {
      grid-template-rows: minmax(140px, 180px) minmax(0, 1fr);
      grid-template-columns: minmax(0, 1fr);
    }

    .operations-catalog nav {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  .is-focus-mode {
    .operations-workspace,
    .operations-main {
      grid-template-rows: minmax(0, 1fr);
      grid-template-columns: minmax(0, 1fr);
    }
  }

  .operations-running-dot {
    animation: operations-running-pulse calc(var(--art-motion-duration-slow) * 4) ease-in-out
      infinite;
  }

  @keyframes operations-running-pulse {
    0%,
    100% {
      opacity: 1;
    }

    50% {
      opacity: 0.35;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .operations-running-dot {
      animation: none;
    }
  }
</style>
