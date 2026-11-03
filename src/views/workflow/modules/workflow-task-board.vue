<template>
  <div class="workflow-task-board">
    <div v-if="tasks.length" class="workflow-task-board__toolbar">
      <span>
        共 {{ tasks.length }} 项任务
        <strong>{{ pendingCount }} 项待处理</strong>
      </span>
      <div class="workflow-task-board__filter">
        <span>只看待处理</span>
        <ElSwitch v-model="onlyPending" size="small" aria-label="只看待处理审批任务" />
      </div>
    </div>
    <ArtEmptyState
      v-if="!taskGroups.length"
      :title="tasks.length ? '当前没有待处理任务' : '流程尚未生成审批任务'"
      :description="
        tasks.length
          ? '可以查看全部任务，核对审批意见与委托、转交记录。'
          : '启动审批后，待办任务会在此按节点展示。'
      "
      size="compact"
      :visual-size="72"
    >
      <ElButton v-if="tasks.length" type="primary" plain @click="onlyPending = false">
        查看全部任务
      </ElButton>
    </ArtEmptyState>

    <section
      v-for="group in taskGroups"
      v-else
      :key="group.nodeKey"
      class="workflow-task-board__group"
    >
      <header class="workflow-task-board__group-header">
        <div class="workflow-task-board__identity">
          <span>{{ group.nodeOrder.toString().padStart(2, '0') }}</span>
          <div>
            <div>
              <strong :title="group.nodeName">{{ group.nodeName }}</strong>
              <ElTag :type="group.tone" size="small" effect="plain">
                {{ group.statusLabel }}
              </ElTag>
            </div>
            <small>
              <ArtSvgIcon icon="ri:shield-check-line" />{{ group.ruleLabel }} <i />{{
                group.ruleDescription
              }}
            </small>
          </div>
        </div>

        <div class="workflow-task-board__progress">
          <div>
            <span>已结束任务</span>
            <strong>{{ group.completedCount }}/{{ group.tasks.length }}</strong>
          </div>
          <ElProgress
            :percentage="group.progressPercentage"
            :show-text="false"
            :stroke-width="6"
            :status="group.progressStatus"
          />
          <small>
            <span class="is-approved">{{ group.approvedCount }} 已通过</span>
            <span v-if="group.pendingCount" class="is-pending">
              {{ group.pendingCount }} 待处理
            </span>
            <span v-if="group.rejectedCount" class="is-rejected">
              {{ group.rejectedCount }} 已驳回
            </span>
          </small>
        </div>
      </header>

      <div class="workflow-task-board__members">
        <article v-for="task in visibleTasks(group)" :key="task.id" :class="`is-${task.status}`">
          <div class="workflow-task-board__member-heading">
            <span class="workflow-task-board__avatar">
              {{ formatAvatarInitials(task.assigneeNameSnapshot, '审') }}
            </span>
            <div>
              <strong :title="task.assigneeNameSnapshot">
                {{ task.assigneeNameSnapshot || '未记录审批人' }}
              </strong>
              <span
                v-if="task.assignmentSource !== 'direct'"
                class="workflow-task-board__assignment"
              >
                <ArtSvgIcon icon="ri:user-shared-line" />{{ assignmentLabel(task) }}
              </span>
              <small :title="getTaskTimeLabel(task)">{{ getTaskTimeLabel(task) }}</small>
            </div>
            <ArtDictDisplay dict-code="workflowTaskStatus" :value="task.status" display="tag" />
          </div>

          <p :class="{ 'is-empty': !task.comment }">
            <ArtSvgIcon :icon="task.comment ? 'ri:chat-quote-line' : 'ri:chat-1-line'" />
            <span>{{ task.comment || getEmptyComment(task.status) }}</span>
          </p>
        </article>
      </div>

      <ElButton
        v-if="group.displayTasks.length > initialVisibleCount"
        class="workflow-task-board__expand"
        text
        type="primary"
        @click="toggleGroup(group.nodeKey)"
      >
        {{
          expandedNodeKeys.has(group.nodeKey)
            ? '收起更多任务'
            : `查看其余 ${group.displayTasks.length - initialVisibleCount} 项任务`
        }}
        <ArtSvgIcon
          :icon="
            expandedNodeKeys.has(group.nodeKey) ? 'ri:arrow-up-s-line' : 'ri:arrow-down-s-line'
          "
        />
      </ElButton>
    </section>
  </div>
</template>

<script setup lang="ts">
  import { groupBy, orderBy, uniqBy } from 'lodash-es'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import { formatDateTimeValue as formatDate, formatAvatarInitials } from '@/utils/ui/format'

  defineOptions({ name: 'WorkflowTaskBoard' })

  type GroupTone = 'primary' | 'success' | 'warning' | 'danger' | 'info'
  type ProgressStatus = 'success' | 'warning' | 'exception' | undefined

  interface Props {
    tasks: Api.Workflow.WorkflowTaskRecord[]
  }

  interface TaskGroup {
    nodeKey: string
    nodeName: string
    nodeOrder: number
    tasks: Api.Workflow.WorkflowTaskRecord[]
    displayTasks: Api.Workflow.WorkflowTaskRecord[]
    ruleLabel: string
    ruleDescription: string
    approvedCount: number
    rejectedCount: number
    pendingCount: number
    completedCount: number
    progressPercentage: number
    progressStatus: ProgressStatus
    tone: GroupTone
    statusLabel: string
  }

  const props = defineProps<Props>()
  const initialVisibleCount = 6
  const onlyPending = ref(false)
  const pendingCount = computed(
    () => props.tasks.filter((task) => task.status === 'pending').length
  )
  const expandedNodeKeys = reactive(new Set<string>())

  const taskGroups = computed<TaskGroup[]>(() => {
    const orderedTasks = [...props.tasks].sort(
      (a, b) => a.nodeOrder - b.nodeOrder || a.createTime.localeCompare(b.createTime)
    )
    const grouped = groupBy(orderedTasks, 'nodeKey')
    return uniqBy(orderedTasks, 'nodeKey')
      .map((task) => createTaskGroup(task.nodeKey, grouped[task.nodeKey]))
      .filter((group) => group.displayTasks.length > 0)
  })

  function createTaskGroup(nodeKey: string, tasks: Api.Workflow.WorkflowTaskRecord[]): TaskGroup {
    const firstTask = tasks[0]
    const approvedCount = tasks.filter((task) => task.status === 'approved').length
    const rejectedCount = tasks.filter((task) => task.status === 'rejected').length
    const pendingCount = tasks.filter((task) => task.status === 'pending').length
    const completedCount = tasks.length - pendingCount
    const progressPercentage = tasks.length ? Math.round((completedCount / tasks.length) * 100) : 0
    const ruleMeta = getRuleMeta(firstTask)
    const statusMeta = getGroupStatusMeta({ approvedCount, rejectedCount, pendingCount })
    const orderedTasks = orderBy(
      tasks,
      [(task) => (task.status === 'pending' ? 0 : 1), 'createTime'],
      ['asc', 'desc']
    )

    return {
      nodeKey,
      nodeName: firstTask?.nodeName || '审批节点',
      nodeOrder: firstTask?.nodeOrder ?? 0,
      tasks,
      displayTasks: onlyPending.value
        ? orderedTasks.filter((task) => task.status === 'pending')
        : orderedTasks,
      ...ruleMeta,
      approvedCount,
      rejectedCount,
      pendingCount,
      completedCount,
      progressPercentage,
      ...statusMeta
    }
  }

  function getRuleMeta(task?: Api.Workflow.WorkflowTaskRecord): {
    ruleLabel: string
    ruleDescription: string
  } {
    if (!task) return { ruleLabel: '审批', ruleDescription: '等待流程生成规则' }
    if (task.approvalMode === 'all') {
      return {
        ruleLabel: '全员会签',
        ruleDescription:
          task.rejectVetoEnabled === false ? '全员完成后综合计算' : '全员通过 · 一票否决'
      }
    }
    if (task.approvalMode === 'percentage') {
      return {
        ruleLabel: '比例会签',
        ruleDescription: `达到 ${task.approvalThresholdPercent ?? 100}% 即通过${
          task.rejectVetoEnabled === false ? '' : ' · 一票否决'
        }`
      }
    }
    return {
      ruleLabel: '或签',
      ruleDescription: `一人通过${task.rejectVetoEnabled === false ? ' · 允许容错' : ' · 一票否决'}`
    }
  }

  function getGroupStatusMeta(counts: {
    approvedCount: number
    rejectedCount: number
    pendingCount: number
  }): {
    tone: GroupTone
    statusLabel: string
    progressStatus: ProgressStatus
  } {
    if (counts.pendingCount) {
      return { tone: 'warning', statusLabel: '待处理', progressStatus: 'warning' }
    }
    if (counts.rejectedCount) {
      return { tone: 'danger', statusLabel: '含驳回记录', progressStatus: 'exception' }
    }
    if (counts.approvedCount) {
      return { tone: 'success', statusLabel: '任务已结束', progressStatus: 'success' }
    }
    return { tone: 'info', statusLabel: '任务已结束', progressStatus: undefined }
  }

  function visibleTasks(group: TaskGroup): Api.Workflow.WorkflowTaskRecord[] {
    return expandedNodeKeys.has(group.nodeKey)
      ? group.displayTasks
      : group.displayTasks.slice(0, initialVisibleCount)
  }

  function toggleGroup(nodeKey: string): void {
    if (expandedNodeKeys.has(nodeKey)) expandedNodeKeys.delete(nodeKey)
    else expandedNodeKeys.add(nodeKey)
  }

  function getTaskTimeLabel(task: Api.Workflow.WorkflowTaskRecord): string {
    if (task.handledAt) return `处理于 ${formatDate(task.handledAt)}`
    if (task.dueAt) return `截止 ${formatDate(task.dueAt)}`
    return `创建于 ${formatDate(task.createTime)}`
  }

  function assignmentLabel(task: Api.Workflow.WorkflowTaskRecord): string {
    const original = task.originalAssigneeNameSnapshot || '原审批人'
    return task.assignmentSource === 'delegation' ? `受 ${original} 委托` : `由 ${original} 转交`
  }

  function getEmptyComment(status: Api.Workflow.TaskStatus): string {
    if (status === 'pending') return '等待审批人处理'
    if (status === 'cancelled') return '任务已结束，未填写意见'
    return '审批人未填写意见'
  }
</script>

<style scoped lang="scss">
  .workflow-task-board {
    display: grid;
    gap: 14px;
    min-width: 0;

    &__toolbar,
    &__filter {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }

    &__toolbar {
      justify-content: space-between;
      font-size: 12px;
      color: var(--el-text-color-secondary);

      > span {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
      }

      strong {
        color: var(--el-text-color-primary);
      }
    }

    &__filter {
      color: var(--el-text-color-regular);
    }

    &__group {
      min-width: 0;
      overflow: hidden;
      background: var(--el-bg-color);
      border: 1px solid var(--el-border-color-lighter);
      border-radius: var(--el-border-radius-base);
    }

    &__group-header {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(220px, 30%);
      gap: 24px;
      align-items: center;
      padding: 15px 16px;
      background: var(--el-fill-color-extra-light);
      border-bottom: 1px solid var(--el-border-color-lighter);
    }

    &__identity {
      display: flex;
      gap: 11px;
      align-items: center;
      min-width: 0;

      > span {
        display: grid;
        flex: 0 0 auto;
        place-items: center;
        width: 36px;
        height: 36px;
        font-size: 12px;
        font-weight: 700;
        color: var(--theme-color);
        background: color-mix(in srgb, var(--theme-color) 10%, transparent);
        border-radius: var(--el-border-radius-base);
      }

      > div {
        display: grid;
        gap: 5px;
        min-width: 0;

        > div {
          display: flex;
          gap: 8px;
          align-items: center;
          min-width: 0;

          strong {
            overflow: hidden;
            text-overflow: ellipsis;
            font-size: 15px;
            color: var(--el-text-color-primary);
            white-space: nowrap;
          }
        }

        > small {
          display: flex;
          flex-wrap: wrap;
          gap: var(--art-control-icon-gap);
          align-items: center;
          color: var(--el-text-color-secondary);

          i {
            width: 3px;
            height: 3px;
            margin: 0 2px;
            background: var(--el-text-color-placeholder);
            border-radius: 50%;
          }
        }
      }
    }

    &__progress {
      display: grid;
      gap: 7px;
      min-width: 0;

      > div {
        display: flex;
        align-items: center;
        justify-content: space-between;

        span {
          font-size: 12px;
          color: var(--el-text-color-secondary);
        }

        strong {
          font-size: 13px;
          color: var(--el-text-color-primary);
        }
      }

      > small {
        display: flex;
        flex-wrap: wrap;
        gap: 9px;
        font-size: 12px;

        .is-approved {
          color: var(--el-color-success);
        }

        .is-pending {
          color: var(--el-color-warning-dark-2);
        }

        .is-rejected {
          color: var(--el-color-danger);
        }
      }
    }

    &__members {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      padding: 14px;

      article {
        min-width: 0;
        padding: 12px;
        background: var(--el-fill-color-extra-light);
        border: 1px solid transparent;
        border-radius: var(--el-border-radius-base);
        transition:
          border-color 0.2s ease,
          box-shadow 0.2s ease;

        &:hover {
          border-color: var(--el-border-color);
        }

        &.is-pending {
          background: color-mix(in srgb, var(--el-color-warning) 5%, var(--el-bg-color));
          border-color: color-mix(in srgb, var(--el-color-warning) 18%, transparent);
        }

        &.is-rejected {
          background: color-mix(in srgb, var(--el-color-danger) 4%, var(--el-bg-color));
          border-color: color-mix(in srgb, var(--el-color-danger) 18%, transparent);
        }

        > p {
          display: flex;
          gap: 7px;
          align-items: flex-start;
          min-height: 20px;
          margin: 10px 0 0 44px;
          font-size: 12px;
          line-height: 1.55;
          color: var(--el-text-color-regular);

          &.is-empty {
            color: var(--el-text-color-secondary);
          }

          span {
            min-width: 0;
            overflow-wrap: anywhere;
          }
        }
      }
    }

    &__member-heading {
      display: grid;
      grid-template-columns: 34px minmax(0, 1fr) auto;
      gap: 10px;
      align-items: center;

      > div {
        display: grid;
        gap: 2px;
        min-width: 0;

        strong,
        small {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        strong {
          font-size: 13px;
          color: var(--el-text-color-primary);
        }

        small {
          font-size: 12px;
          color: var(--el-text-color-secondary);
        }
      }
    }

    &__avatar {
      display: grid;
      place-items: center;
      width: 34px;
      height: 34px;
      font-size: 12px;
      font-weight: 700;
      color: var(--theme-color);
      text-transform: uppercase;
      background: color-mix(in srgb, var(--theme-color) 11%, var(--el-bg-color));
      border: 1px solid color-mix(in srgb, var(--theme-color) 18%, transparent);
      border-radius: 50%;
    }

    &__assignment {
      display: flex;
      gap: 4px;
      align-items: center;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 12px;
      color: var(--el-color-warning-dark-2);
      white-space: nowrap;

      svg {
        flex: 0 0 auto;
      }
    }

    &__expand {
      width: calc(100% - 28px);
      margin: 0 14px 12px;
      border-top: 1px dashed var(--el-border-color-lighter);
      border-radius: 0;
    }
  }

  @media (width <= 760px) {
    .workflow-task-board {
      &__group-header {
        grid-template-columns: minmax(0, 1fr);
        gap: 13px;
      }

      &__members {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  }

  @media (width <= 480px) {
    .workflow-task-board {
      &__identity > div > small i,
      &__identity > div > small i + * {
        display: none;
      }

      &__members {
        padding: 10px;
      }

      &__member-heading {
        grid-template-columns: 34px minmax(0, 1fr);

        :deep(.el-tag) {
          grid-column: 2;
          justify-self: start;
        }
      }
    }
  }

  :global(html[data-box-mode='border-mode'] .workflow-task-board__members article:focus-within),
  :global(html[data-box-mode='border-mode'] .workflow-task-board__members article:hover) {
    border-color: var(--theme-color);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--theme-color) 45%, transparent);
  }

  :global(html[data-box-mode='shadow-mode'] .workflow-task-board__members article:focus-within),
  :global(html[data-box-mode='shadow-mode'] .workflow-task-board__members article:hover) {
    border-color: transparent;
    box-shadow: 0 7px 18px color-mix(in srgb, var(--theme-color) 15%, transparent);
  }
</style>
