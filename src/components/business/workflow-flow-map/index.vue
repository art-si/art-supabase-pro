<template>
  <div ref="flowMapRef" class="workflow-flow-map" :class="{ 'is-compact': compact }">
    <header class="workflow-flow-map__toolbar">
      <div class="workflow-flow-map__legend" aria-label="流程状态图例">
        <span v-for="item in visibleLegend" :key="item.state" :class="`is-${item.state}`">
          <i />{{ item.label }}
        </span>
      </div>
      <small><ArtSvgIcon icon="ri:drag-move-2-line" />拖动画布 · 使用控件缩放</small>
    </header>

    <div class="workflow-flow-map__workspace" :class="{ 'has-inspector': selectedNode }">
      <div class="workflow-flow-map__canvas" role="img" :aria-label="flowAriaLabel">
        <VueFlow
          :nodes="flowNodes"
          :edges="flowEdges"
          :min-zoom="0.45"
          :max-zoom="1.5"
          :fit-view-on-init="true"
          :fit-view-params="{ padding: 0.16, maxZoom: compact ? 0.9 : 1 }"
          :nodes-draggable="false"
          :nodes-connectable="false"
          :edges-updatable="false"
          :zoom-on-scroll="false"
          :zoom-on-double-click="false"
          :pan-on-drag="true"
          :prevent-scrolling="false"
          @node-click="handleNodeClick"
        >
          <Background pattern-color="var(--el-border-color-lighter)" :gap="18" :size="1.1" />

          <template #node-terminal="{ data }">
            <div
              class="workflow-flow-map__terminal"
              :class="[`is-${data.state}`, { 'is-selected': data.key === selectedNodeKey }]"
            >
              <Handle type="target" :position="Position.Left" />
              <span><ArtSvgIcon :icon="data.icon" /></span>
              <strong>{{ data.label }}</strong>
              <small>{{ data.description }}</small>
              <Handle type="source" :position="Position.Right" />
            </div>
          </template>

          <template #node-approval="{ data }">
            <article
              class="workflow-flow-map__node"
              :class="[`is-${data.state}`, { 'is-selected': data.key === selectedNodeKey }]"
            >
              <Handle type="target" :position="Position.Left" />
              <header>
                <span>{{ data.order }}</span>
                <em><i />{{ data.stateLabel }}</em>
              </header>
              <strong :title="data.label">{{ data.label }}</strong>
              <small>{{ data.assignee }} · {{ data.approval }}</small>
              <div>
                <span class="art-icon-label" v-if="data.hasCondition">
                  <ArtSvgIcon icon="ri:git-branch-line" />有条件
                </span>
                <span class="art-icon-label"
                  ><ArtSvgIcon icon="ri:time-line" />{{ data.dueHours }} 小时</span
                >
              </div>
              <Handle type="source" :position="Position.Right" />
            </article>
          </template>

          <MiniMap
            v-if="flowNodes.length > 4"
            pannable
            zoomable
            position="bottom-right"
            :node-border-radius="8"
            node-color="var(--el-color-primary-light-8)"
            node-stroke-color="var(--el-color-primary-light-3)"
            mask-color="color-mix(in srgb, var(--el-bg-color) 78%, transparent)"
          />
          <Controls
            position="bottom-left"
            :show-interactive="false"
            :fit-view-params="{ padding: 0.16, maxZoom: compact ? 0.9 : 1 }"
          />
        </VueFlow>
      </div>

      <aside v-if="selectedNode" class="workflow-flow-map__inspector" aria-label="审批节点详情">
        <header>
          <div>
            <span>{{ selectedNode.order.toString().padStart(2, '0') }}</span>
            <div>
              <small>审批节点</small>
              <strong>{{ selectedNode.name }}</strong>
            </div>
          </div>
          <ElTag :type="stateMeta[selectedNodeState].type" size="small" effect="plain">
            {{ stateMeta[selectedNodeState].label }}
          </ElTag>
        </header>

        <dl>
          <div>
            <dt><ArtSvgIcon icon="ri:group-line" />审批对象</dt>
            <dd>{{ assigneeText(selectedNode) }}</dd>
          </div>
          <div>
            <dt><ArtSvgIcon icon="ri:shield-check-line" />决策规则</dt>
            <dd>{{ approvalText(selectedNode) }}</dd>
          </div>
          <div>
            <dt><ArtSvgIcon icon="ri:timer-line" />办理时限</dt>
            <dd>{{ selectedNode.dueHours }} 小时</dd>
          </div>
          <div>
            <dt><ArtSvgIcon icon="ri:alarm-warning-line" />超时升级</dt>
            <dd>
              {{
                selectedNode.escalationEnabled
                  ? `${selectedNode.escalateAfterHours} 小时后升级`
                  : '未启用'
              }}
            </dd>
          </div>
        </dl>

        <div class="workflow-flow-map__condition">
          <small><ArtSvgIcon icon="ri:git-branch-line" />进入条件</small>
          <p>{{ conditionText(selectedNode.condition) }}</p>
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { uniq } from 'lodash-es'
  import { Background } from '@vue-flow/background'
  import { Controls } from '@vue-flow/controls'
  import {
    Handle,
    MarkerType,
    Position,
    VueFlow,
    type Edge,
    type Node,
    type NodeMouseEvent
  } from '@vue-flow/core'
  import { MiniMap } from '@vue-flow/minimap'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'

  import '@vue-flow/core/dist/style.css'
  import '@vue-flow/core/dist/theme-default.css'
  import '@vue-flow/controls/dist/style.css'
  import '@vue-flow/minimap/dist/style.css'

  defineOptions({ name: 'WorkflowFlowMap' })

  type NodeState =
    'planned' | 'waiting' | 'current' | 'approved' | 'rejected' | 'skipped' | 'matched'

  interface Props {
    nodes: Api.Workflow.WorkflowNode[]
    tasks?: Api.Workflow.WorkflowTaskRecord[]
    skippedNodeKeys?: string[]
    currentNodeKey?: string | null
    instanceStatus?: Api.Workflow.InstanceStatus
    simulationStates?: Record<string, 'matched' | 'skipped'>
    simulationOutcome?: 'matched' | 'blocked' | 'auto-approved'
    compact?: boolean
  }

  interface FlowNodeData {
    kind: 'terminal' | 'approval'
    key: string
    label: string
    state: NodeState
    description?: string
    icon?: string
    order?: number
    stateLabel?: string
    assignee?: string
    approval?: string
    dueHours?: number
    hasCondition?: boolean
  }

  const props = withDefaults(defineProps<Props>(), {
    tasks: () => [],
    skippedNodeKeys: () => [],
    currentNodeKey: null,
    instanceStatus: undefined,
    simulationStates: undefined,
    simulationOutcome: undefined,
    compact: false
  })

  const stateMeta: Record<
    NodeState,
    { label: string; type: 'primary' | 'success' | 'warning' | 'danger' | 'info' }
  > = {
    planned: { label: '已配置', type: 'primary' },
    waiting: { label: '待执行', type: 'info' },
    current: { label: '处理中', type: 'warning' },
    approved: { label: '已通过', type: 'success' },
    rejected: { label: '已驳回', type: 'danger' },
    skipped: { label: '已跳过', type: 'info' },
    matched: { label: '条件命中', type: 'success' }
  }

  const orderedNodes = computed(() => [...props.nodes].sort((a, b) => a.order - b.order))
  const flowMapRef = ref<HTMLElement>()
  const selectedNodeKey = ref<string | null>(null)
  const taskMap = computed(() => {
    const map = new Map<string, Api.Workflow.WorkflowTaskRecord[]>()
    props.tasks.forEach((task) => map.set(task.nodeKey, [...(map.get(task.nodeKey) ?? []), task]))
    return map
  })
  const skippedKeys = computed(() => new Set(props.skippedNodeKeys))
  const selectedNode = computed(
    () => orderedNodes.value.find((node) => node.key === selectedNodeKey.value) ?? null
  )
  const selectedNodeState = computed<NodeState>(() =>
    selectedNode.value ? resolveNodeState(selectedNode.value) : 'planned'
  )
  const visibleLegend = computed(() => {
    if (props.simulationOutcome) {
      return (['matched', 'skipped'] as NodeState[]).map((state) => ({
        state,
        label: stateMeta[state].label
      }))
    }
    const states = props.instanceStatus
      ? (['current', 'approved', 'waiting', 'rejected', 'skipped'] as NodeState[])
      : (['planned'] as NodeState[])
    return states.map((state) => ({ state, label: stateMeta[state].label }))
  })
  const endState = computed<NodeState>(() => {
    if (props.simulationOutcome === 'matched') return 'matched'
    if (props.simulationOutcome === 'auto-approved') return 'approved'
    if (props.simulationOutcome === 'blocked') return 'rejected'
    if (!props.instanceStatus) return 'planned'
    if (props.instanceStatus === 'running') return 'waiting'
    if (props.instanceStatus === 'approved') return 'approved'
    if (props.instanceStatus === 'rejected') return 'rejected'
    return 'skipped'
  })
  const endLabel = computed(() => {
    if (props.simulationOutcome === 'matched') return '可进入审批'
    if (props.simulationOutcome === 'auto-approved') return '自动通过'
    if (props.simulationOutcome === 'blocked') return '安全阻断'
    const labels: Partial<Record<Api.Workflow.InstanceStatus, string>> = {
      running: '待完成',
      approved: '已通过',
      rejected: '已驳回',
      withdrawn: '已撤回',
      cancelled: '已终止'
    }
    return props.instanceStatus ? (labels[props.instanceStatus] ?? '结束') : '结束'
  })
  const endIcon = computed(() => {
    if (props.simulationOutcome === 'matched') return 'ri:route-line'
    if (props.simulationOutcome === 'auto-approved') return 'ri:checkbox-circle-line'
    if (props.simulationOutcome === 'blocked') return 'ri:shield-line'
    if (props.instanceStatus === 'approved') return 'ri:checkbox-circle-line'
    if (props.instanceStatus === 'rejected' || props.instanceStatus === 'cancelled') {
      return 'ri:close-circle-line'
    }
    if (props.instanceStatus === 'withdrawn') return 'ri:arrow-go-back-line'
    return 'ri:flag-line'
  })
  const flowAriaLabel = computed(
    () => `审批流程，共 ${orderedNodes.value.length} 个审批节点，点击节点可查看详细规则`
  )

  const flowNodes = computed<Node<FlowNodeData>[]>(() => {
    const horizontalGap = props.compact ? 258 : 286
    const nodes: Node<FlowNodeData>[] = [
      {
        id: 'workflow-start',
        type: 'terminal',
        position: { x: 0, y: 70 },
        draggable: false,
        selectable: true,
        connectable: false,
        data: {
          kind: 'terminal',
          key: 'workflow-start',
          label: '发起',
          description: '提交审批',
          icon: 'ri:play-line',
          state: props.instanceStatus || props.simulationOutcome ? 'approved' : 'planned'
        }
      }
    ]

    orderedNodes.value.forEach((node, index) => {
      const state = resolveNodeState(node)
      nodes.push({
        id: node.key,
        type: 'approval',
        position: { x: 132 + index * horizontalGap, y: 38 },
        draggable: false,
        selectable: true,
        connectable: false,
        data: {
          kind: 'approval',
          key: node.key,
          label: node.name,
          order: index + 1,
          state,
          stateLabel: stateMeta[state].label,
          assignee: assigneeText(node),
          approval: approvalText(node),
          dueHours: node.dueHours,
          hasCondition: node.condition.operator !== 'always'
        }
      })
    })

    nodes.push({
      id: 'workflow-end',
      type: 'terminal',
      position: { x: 132 + orderedNodes.value.length * horizontalGap, y: 70 },
      draggable: false,
      selectable: true,
      connectable: false,
      data: {
        kind: 'terminal',
        key: 'workflow-end',
        label: endLabel.value,
        description: props.instanceStatus || props.simulationOutcome ? '流程结果' : '流程结束',
        icon: endIcon.value,
        state: endState.value
      }
    })
    return nodes
  })

  const flowEdges = computed<Edge[]>(() => {
    const ids = flowNodes.value.map((node) => node.id)
    return ids.slice(0, -1).map((source, index) => {
      const target = ids[index + 1]
      const targetNode = flowNodes.value[index + 1]
      const state = targetNode.data?.state ?? 'planned'
      const isCurrent = state === 'current'
      const color = edgeColor(state)
      return {
        id: `${source}-${target}`,
        source,
        target,
        type: 'smoothstep',
        animated: isCurrent,
        selectable: false,
        focusable: false,
        style: { stroke: color, strokeWidth: isCurrent ? 2.4 : 1.6 },
        markerEnd: { type: MarkerType.ArrowClosed, color, width: 18, height: 18 }
      }
    })
  })

  watch(
    [orderedNodes, () => props.currentNodeKey],
    ([nodes, currentNodeKey]) => {
      if (selectedNodeKey.value && nodes.some((node) => node.key === selectedNodeKey.value)) return
      selectedNodeKey.value = currentNodeKey || nodes[0]?.key || null
    },
    { immediate: true }
  )

  const controlLabels = [
    ['.vue-flow__controls-zoomin', '放大流程图'],
    ['.vue-flow__controls-zoomout', '缩小流程图'],
    ['.vue-flow__controls-fitview', '适应画布']
  ] as const

  function labelFlowControls(): void {
    controlLabels.forEach(([selector, label]) => {
      const control = flowMapRef.value?.querySelector<HTMLButtonElement>(selector)
      control?.setAttribute('aria-label', label)
      control?.setAttribute('title', label)
    })
  }

  onMounted(() => void nextTick(labelFlowControls))
  watch(flowNodes, () => void nextTick(labelFlowControls), { flush: 'post' })

  function resolveNodeState(node: Api.Workflow.WorkflowNode): NodeState {
    if (props.simulationOutcome) return props.simulationStates?.[node.key] ?? 'skipped'
    if (!props.instanceStatus) return 'planned'
    if (skippedKeys.value.has(node.key)) return 'skipped'
    const tasks = taskMap.value.get(node.key) ?? []
    if (tasks.some((task) => task.status === 'rejected')) return 'rejected'
    if (tasks.length && tasks.every((task) => ['approved', 'cancelled'].includes(task.status))) {
      return tasks.some((task) => task.status === 'approved') ? 'approved' : 'skipped'
    }
    if (node.key === props.currentNodeKey || tasks.some((task) => task.status === 'pending')) {
      return 'current'
    }
    return 'waiting'
  }

  function assigneeText(node: Api.Workflow.WorkflowNode): string {
    const assignedNames = (taskMap.value.get(node.key) ?? [])
      .map((task) => task.assigneeNameSnapshot?.trim())
      .filter((name): name is string => Boolean(name))
    const uniqueNames = uniq(assignedNames)
    if (uniqueNames.length) return uniqueNames.join('、')
    if (node.assignee.type === 'initiator') return '发起人'
    const count =
      node.assignee.type === 'users'
        ? (node.assignee.userIds?.length ?? 0)
        : (node.assignee.roleCodes?.length ?? 0)
    return `${count} 个${node.assignee.type === 'users' ? '人员' : '角色'}`
  }

  function approvalText(node: Api.Workflow.WorkflowNode): string {
    if (node.approvalMode === 'all') return '全员会签'
    if (node.approvalMode === 'percentage') return `${node.approvalThresholdPercent}% 通过`
    return '一人通过（或签）'
  }

  function conditionText(condition: Api.Workflow.WorkflowCondition): string {
    if (condition.operator === 'always') return '无条件进入此节点'
    const operatorLabels: Record<Api.Workflow.ConditionOperator, string> = {
      always: '无条件',
      eq: '等于',
      ne: '不等于',
      gt: '大于',
      gte: '大于等于',
      lt: '小于',
      lte: '小于等于',
      in: '属于',
      contains: '包含',
      not_empty: '不为空'
    }
    const value = Array.isArray(condition.value) ? condition.value.join('、') : condition.value
    return [condition.field, operatorLabels[condition.operator], value].filter(Boolean).join(' ')
  }

  function edgeColor(state: NodeState): string {
    if (state === 'current') return 'var(--theme-color)'
    if (state === 'approved' || state === 'matched') return 'var(--el-color-success)'
    if (state === 'rejected') return 'var(--el-color-danger)'
    return 'var(--el-border-color)'
  }

  function handleNodeClick({ node }: NodeMouseEvent): void {
    const data = node.data as FlowNodeData
    if (data.kind === 'approval') selectedNodeKey.value = data.key
  }
</script>

<style scoped lang="scss">
  .workflow-flow-map {
    min-width: 0;

    &__toolbar {
      display: flex;
      gap: 12px;
      align-items: center;
      justify-content: space-between;
      min-height: 28px;
      margin-bottom: 10px;

      > small {
        display: flex;
        flex: 0 0 auto;
        gap: 5px;
        align-items: center;
        color: var(--el-text-color-secondary);
      }
    }

    &__legend {
      display: flex;
      flex-wrap: wrap;
      gap: 7px 14px;
      min-width: 0;

      span {
        display: flex;
        gap: 6px;
        align-items: center;
        font-size: 12px;
        color: var(--el-text-color-secondary);

        i {
          width: 7px;
          height: 7px;
          background: var(--el-color-info);
          border-radius: 50%;
        }

        &.is-current i,
        &.is-planned i {
          background: var(--theme-color);
        }

        &.is-approved i {
          background: var(--el-color-success);
        }

        &.is-matched i {
          background: var(--el-color-success);
        }

        &.is-rejected i {
          background: var(--el-color-danger);
        }
      }
    }

    &__workspace {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      min-width: 0;
      overflow: hidden;
      background: var(--el-fill-color-extra-light);
      border: 1px solid var(--el-border-color-lighter);
      border-radius: var(--el-border-radius-base);

      &.has-inspector {
        grid-template-columns: minmax(0, 1fr) 260px;
      }
    }

    &__canvas {
      min-width: 0;
      height: 320px;
      background: color-mix(in srgb, var(--el-fill-color-extra-light) 72%, var(--el-bg-color));
    }

    &__terminal,
    &__node {
      background: var(--el-bg-color);
      border: 1px solid var(--el-border-color-light);
      border-radius: var(--el-border-radius-base);
      box-shadow: 0 6px 18px rgb(31 45 61 / 5%);
      transition:
        border-color 0.2s ease,
        box-shadow 0.2s ease,
        transform 0.2s ease;

      :deep(.vue-flow__handle) {
        width: 7px;
        height: 7px;
        pointer-events: none;
        background: var(--el-bg-color);
        border: 2px solid var(--el-border-color);
      }
    }

    &__terminal {
      display: grid;
      place-items: center;
      width: 90px;
      min-height: 96px;
      padding: 12px 8px;
      color: var(--el-text-color-regular);
      text-align: center;

      > span {
        display: grid;
        place-items: center;
        width: 34px;
        height: 34px;
        color: var(--theme-color);
        background: color-mix(in srgb, var(--theme-color) 12%, transparent);
        border-radius: 50%;
      }

      strong {
        margin-top: 7px;
        font-size: 13px;
      }

      small {
        margin-top: 2px;
        font-size: 10px;
        color: var(--el-text-color-secondary);
      }

      &.is-approved > span {
        color: var(--el-color-success);
        background: var(--el-color-success-light-9);
      }

      &.is-rejected > span {
        color: var(--el-color-danger);
        background: var(--el-color-danger-light-9);
      }
    }

    &__node {
      width: 228px;
      min-height: 160px;
      padding: 14px;

      > header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 13px;

        > span {
          display: grid;
          place-items: center;
          width: 25px;
          height: 25px;
          font-size: 11px;
          color: var(--el-text-color-secondary);
          background: var(--el-fill-color-light);
          border-radius: 50%;
        }

        em {
          display: flex;
          gap: 6px;
          align-items: center;
          padding: 3px 7px;
          font-size: 11px;
          font-style: normal;
          color: var(--el-text-color-secondary);
          background: var(--el-fill-color-light);
          border-radius: 999px;

          i {
            width: 6px;
            height: 6px;
            background: var(--el-color-info);
            border-radius: 50%;
          }
        }
      }

      > strong,
      > small {
        display: block;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      > strong {
        font-size: 15px;
        color: var(--el-text-color-primary);
      }

      > small {
        margin-top: 5px;
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }

      > div {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 14px;

        span {
          display: flex;
          gap: 4px;
          align-items: center;
          padding: 4px 7px;
          font-size: 11px;
          color: var(--el-text-color-secondary);
          background: var(--el-fill-color-light);
          border-radius: var(--el-border-radius-small);
        }
      }

      &.is-current {
        background: color-mix(in srgb, var(--theme-color) 6%, var(--el-bg-color));
        border-color: var(--theme-color);

        > header em {
          color: var(--el-color-warning-dark-2);
          background: var(--el-color-warning-light-9);

          i {
            background: var(--el-color-warning);
            box-shadow: 0 0 0 4px color-mix(in srgb, var(--el-color-warning) 15%, transparent);
          }
        }
      }

      &.is-approved,
      &.is-matched {
        border-color: color-mix(in srgb, var(--el-color-success) 45%, var(--el-border-color));

        > header em i {
          background: var(--el-color-success);
        }
      }

      &.is-rejected {
        border-color: color-mix(in srgb, var(--el-color-danger) 52%, var(--el-border-color));

        > header em i {
          background: var(--el-color-danger);
        }
      }

      &.is-skipped {
        border-style: dashed;
        opacity: 0.72;
      }
    }

    &__terminal.is-selected,
    &__node.is-selected {
      transform: translateY(-2px);
    }

    &__inspector {
      display: grid;
      align-content: start;
      min-width: 0;
      padding: 16px;
      background: var(--el-bg-color);
      border-left: 1px solid var(--el-border-color-lighter);

      > header {
        display: flex;
        gap: 10px;
        align-items: flex-start;
        justify-content: space-between;
        padding-bottom: 14px;
        border-bottom: 1px solid var(--el-border-color-lighter);

        > div {
          display: flex;
          gap: 9px;
          min-width: 0;

          > span {
            display: grid;
            flex: 0 0 auto;
            place-items: center;
            width: 30px;
            height: 30px;
            font-size: 11px;
            font-weight: 700;
            color: var(--theme-color);
            background: color-mix(in srgb, var(--theme-color) 10%, transparent);
            border-radius: var(--el-border-radius-small);
          }

          > div {
            display: grid;
            min-width: 0;
          }
        }

        small {
          font-size: 10px;
          color: var(--el-text-color-secondary);
        }

        strong {
          overflow: hidden;
          text-overflow: ellipsis;
          color: var(--el-text-color-primary);
          white-space: nowrap;
        }
      }

      dl {
        display: grid;
        gap: 11px;
        margin: 15px 0;

        > div {
          display: flex;
          gap: 12px;
          align-items: center;
          justify-content: space-between;
        }

        dt {
          display: flex;
          flex: 0 0 auto;
          gap: 6px;
          align-items: center;
          font-size: 12px;
          color: var(--el-text-color-secondary);
        }

        dd {
          min-width: 0;
          margin: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          font-size: 12px;
          color: var(--el-text-color-primary);
          white-space: nowrap;
        }
      }
    }

    &__condition {
      padding: 11px;
      background: var(--el-fill-color-light);
      border-radius: var(--el-border-radius-small);

      small {
        display: flex;
        gap: 5px;
        align-items: center;
        color: var(--el-text-color-secondary);
      }

      p {
        margin: 6px 0 0;
        font-size: 12px;
        line-height: 1.5;
        color: var(--el-text-color-primary);
        overflow-wrap: anywhere;
      }
    }

    :deep(.vue-flow__node) {
      background: transparent;
      border: 0;
    }

    :deep(.vue-flow__controls) {
      overflow: hidden;
      background: var(--el-bg-color);
      border: 1px solid var(--el-border-color-lighter);
      border-radius: var(--el-border-radius-small);
      box-shadow: 0 6px 18px rgb(31 45 61 / 8%);
    }

    :deep(.vue-flow__controls-button) {
      color: var(--el-text-color-regular);
      background: var(--el-bg-color);
      border-bottom-color: var(--el-border-color-lighter);

      &:hover,
      &:focus-visible {
        color: var(--theme-color);
        background: color-mix(in srgb, var(--theme-color) 8%, var(--el-bg-color));
      }
    }

    :deep(.vue-flow__minimap) {
      overflow: hidden;
      background: var(--el-bg-color);
      border: 1px solid var(--el-border-color-lighter);
      border-radius: var(--el-border-radius-small);
      box-shadow: 0 6px 18px rgb(31 45 61 / 8%);
    }

    &.is-compact {
      .workflow-flow-map__canvas {
        height: 280px;
      }

      .workflow-flow-map__node {
        width: 208px;
        min-height: 150px;
      }
    }
  }

  @media (width <= 920px) {
    .workflow-flow-map {
      &__workspace.has-inspector {
        grid-template-columns: minmax(0, 1fr);
      }

      &__inspector {
        border-top: 1px solid var(--el-border-color-lighter);
        border-left: 0;
      }
    }
  }

  @media (width <= 640px) {
    .workflow-flow-map {
      &__toolbar {
        align-items: flex-start;

        > small {
          display: none;
        }
      }

      &__canvas {
        height: 270px;
      }

      &__inspector dl {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  }

  :global(html[data-box-mode='border-mode'] .workflow-flow-map__node.is-selected),
  :global(html[data-box-mode='border-mode'] .workflow-flow-map__terminal.is-selected) {
    border-color: var(--theme-color);
    box-shadow: inset 0 0 0 1px var(--theme-color);
  }

  :global(html[data-box-mode='shadow-mode'] .workflow-flow-map__node.is-selected),
  :global(html[data-box-mode='shadow-mode'] .workflow-flow-map__terminal.is-selected) {
    border-color: transparent;
    box-shadow: 0 10px 24px color-mix(in srgb, var(--theme-color) 22%, transparent);
  }
</style>
