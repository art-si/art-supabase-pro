<template>
  <ArtSectionCard class="workflow-canvas-editor" preserve-content-structure>
    <template #header>
      <header class="workflow-canvas-editor__toolbar">
        <div>
          <ArtSectionTitle :show-line="false">审批流程画布</ArtSectionTitle>
          <p>节点可自由拖放；卡片序号决定审批顺序，自动整理只调整画布位置。</p>
        </div>
        <div class="workflow-canvas-editor__toolbar-actions">
          <ElTag
            effect="plain"
            :type="configuredNodeCount === nodes.length ? 'success' : 'warning'"
          >
            已配置 {{ configuredNodeCount }}/{{ nodes.length }} 个节点
          </ElTag>
          <ElButtonGroup>
            <ArtTooltip content="审批顺序前移" placement="bottom">
              <ElButton
                :disabled="selectedIndex <= 0"
                aria-label="审批顺序前移"
                @click="moveSelected(-1)"
              >
                <ArtSvgIcon icon="ri:arrow-up-line" />
              </ElButton>
            </ArtTooltip>
            <ArtTooltip content="审批顺序后移" placement="bottom">
              <ElButton
                :disabled="selectedIndex < 0 || selectedIndex >= nodes.length - 1"
                aria-label="审批顺序后移"
                @click="moveSelected(1)"
              >
                <ArtSvgIcon icon="ri:arrow-down-line" />
              </ElButton>
            </ArtTooltip>
            <ArtTooltip content="删除选中节点" placement="bottom">
              <ElButton
                type="danger"
                plain
                :disabled="selectedIndex < 0"
                aria-label="删除选中节点"
                @click="removeSelected"
              >
                <ArtSvgIcon icon="ri:delete-bin-6-line" />
              </ElButton>
            </ArtTooltip>
          </ElButtonGroup>
          <ElButton type="primary" @click="addNode">
            <ArtSvgIcon icon="ri:add-line" />新增审批节点
          </ElButton>
        </div>
      </header>
    </template>

    <div class="workflow-canvas-editor__guide" :class="{ 'is-warning': !tenantId }" role="status">
      <ArtSvgIcon :icon="tenantId ? 'ri:mouse-line' : 'ri:information-line'" />
      <span v-if="tenantId"
        >指针模式拖动节点 · 手型模式平移画布 · 右键打开菜单 · 卡片序号表示审批顺序</span
      >
      <span v-else>请先在基础信息选择所属租户，随后即可搜索该租户的成员和角色。</span>
      <ElButton v-if="!tenantId" link type="primary" @click="emit('request-step', 1)">
        去选择租户
      </ElButton>
    </div>

    <div
      class="workflow-canvas-editor__workspace"
      :class="{
        'has-inspector': inspectorVisible,
        'is-pan-mode': interactionMode === 'pan',
        'is-layout-locked': layoutLocked
      }"
      tabindex="0"
      @keydown="handleWorkspaceKeydown"
    >
      <div class="workflow-canvas-editor__canvas" :aria-label="flowAriaLabel">
        <div class="workflow-canvas-editor__canvas-toolbar" role="toolbar" aria-label="画布工具">
          <ElButtonGroup>
            <ArtTooltip content="撤销（Ctrl+Z）" placement="bottom">
              <ElButton :disabled="!canUndo" aria-label="撤销画布调整" @click="undoStructure">
                <ArtSvgIcon icon="ri:arrow-go-back-line" />
              </ElButton>
            </ArtTooltip>
            <ArtTooltip content="重做（Ctrl+Shift+Z）" placement="bottom">
              <ElButton :disabled="!canRedo" aria-label="重做画布调整" @click="redoStructure">
                <ArtSvgIcon icon="ri:arrow-go-forward-line" />
              </ElButton>
            </ArtTooltip>
          </ElButtonGroup>

          <i class="workflow-canvas-editor__canvas-toolbar-divider" aria-hidden="true"></i>

          <ElButtonGroup>
            <ArtTooltip content="指针模式：选择和拖动节点" placement="bottom">
              <ElButton
                :type="interactionMode === 'select' ? 'primary' : 'default'"
                :plain="interactionMode !== 'select'"
                aria-label="切换到指针模式"
                @click="interactionMode = 'select'"
              >
                <ArtSvgIcon icon="ri:cursor-line" />
              </ElButton>
            </ArtTooltip>
            <ArtTooltip content="手型模式：拖动画布" placement="bottom">
              <ElButton
                :type="interactionMode === 'pan' ? 'primary' : 'default'"
                :plain="interactionMode !== 'pan'"
                aria-label="切换到手型模式"
                @click="interactionMode = 'pan'"
              >
                <ArtSvgIcon icon="ri:hand" />
              </ElButton>
            </ArtTooltip>
          </ElButtonGroup>

          <i class="workflow-canvas-editor__canvas-toolbar-divider" aria-hidden="true"></i>

          <ElButtonGroup>
            <ArtTooltip content="适配画布" placement="bottom">
              <ElButton aria-label="适配全部节点" @click="fitCanvas">
                <ArtSvgIcon icon="ri:fullscreen-line" />
              </ElButton>
            </ArtTooltip>
            <ArtTooltip
              :content="
                layoutMode === 'horizontal' ? '当前为横向布局，点击重新整理' : '横向整理节点'
              "
              placement="bottom"
            >
              <ElButton
                aria-label="横向整理节点"
                :aria-pressed="layoutMode === 'horizontal'"
                @click="arrangeCanvas('horizontal')"
              >
                <ArtSvgIcon icon="ri:organization-chart" />
              </ElButton>
            </ArtTooltip>
            <ArtTooltip
              :content="layoutMode === 'vertical' ? '当前为纵向布局，点击重新整理' : '纵向整理节点'"
              placement="bottom"
            >
              <ElButton
                aria-label="纵向整理节点"
                :aria-pressed="layoutMode === 'vertical'"
                @click="arrangeCanvas('vertical')"
              >
                <ArtSvgIcon icon="ri:node-tree" />
              </ElButton>
            </ArtTooltip>
            <ArtTooltip
              :content="layoutLocked ? '解锁节点位置' : '锁定节点位置'"
              placement="bottom"
            >
              <ElButton
                :type="layoutLocked ? 'primary' : 'default'"
                :plain="!layoutLocked"
                :aria-label="layoutLocked ? '解锁节点位置' : '锁定节点位置'"
                @click="layoutLocked = !layoutLocked"
              >
                <ArtSvgIcon :icon="layoutLocked ? 'ri:lock-line' : 'ri:lock-unlock-line'" />
              </ElButton>
            </ArtTooltip>
            <ArtTooltip
              :content="inspectorVisible ? '收起属性面板' : '显示属性面板'"
              placement="bottom"
            >
              <ElButton
                :aria-label="inspectorVisible ? '收起属性面板' : '显示属性面板'"
                @click="inspectorVisible = !inspectorVisible"
              >
                <ArtSvgIcon
                  :icon="inspectorVisible ? 'ri:sidebar-fold-line' : 'ri:sidebar-unfold-line'"
                />
              </ElButton>
            </ArtTooltip>
          </ElButtonGroup>
        </div>

        <VueFlow
          id="workflow-designer-flow"
          v-model:nodes="flowNodes"
          :edges="flowEdges"
          :min-zoom="0.35"
          :max-zoom="1.6"
          :fit-view-on-init="true"
          :fit-view-params="{ padding: 0.2, maxZoom: 1 }"
          :nodes-connectable="false"
          :edges-updatable="false"
          :zoom-on-scroll="true"
          :zoom-on-double-click="true"
          :pan-on-drag="interactionMode === 'pan'"
          :prevent-scrolling="true"
          :nodes-draggable="nodesDraggable"
          :snap-to-grid="true"
          :snap-grid="[12, 12]"
          :auto-pan-on-node-drag="true"
          @node-click="handleNodeClick"
          @node-context-menu="handleNodeContextMenu"
          @node-drag-start="handleNodeDragStart"
          @node-drag-stop="handleNodeDragStop"
          @pane-click="closeContextMenu"
          @pane-context-menu="handlePaneContextMenu"
        >
          <Background pattern-color="var(--el-border-color-lighter)" :gap="20" :size="1.1" />

          <template #node-terminal="{ data }">
            <div class="workflow-canvas-editor__terminal" :aria-label="`${data.label}，可自由拖动`">
              <Handle
                v-if="data.kind === 'end'"
                type="target"
                :position="canvasDirection === 'vertical' ? Position.Top : Position.Left"
              />
              <span :class="`is-${data.kind}`"><ArtSvgIcon :icon="data.icon" /></span>
              <div>
                <strong>{{ data.label }}</strong>
                <small>{{ data.description }}</small>
              </div>
              <Handle
                v-if="data.kind === 'start'"
                type="source"
                :position="canvasDirection === 'vertical' ? Position.Bottom : Position.Right"
              />
            </div>
          </template>

          <template #node-approval="{ data }">
            <button
              type="button"
              class="workflow-canvas-editor__node"
              :class="{ 'is-selected': data.key === selectedNodeKey }"
              :aria-pressed="data.key === selectedNodeKey"
              :aria-label="`${data.label}，${data.assignee}，序号 ${data.order}，可自由拖动或右键操作`"
              @click.stop="selectNode(data.key)"
            >
              <Handle
                type="target"
                :position="canvasDirection === 'vertical' ? Position.Top : Position.Left"
              />
              <span class="workflow-canvas-editor__node-icon" aria-hidden="true">
                <ArtSvgIcon icon="ri:user-follow-line" />
              </span>
              <span class="workflow-canvas-editor__node-copy">
                <strong>{{ data.label }}</strong>
                <small>{{ data.assignee }}</small>
                <em>
                  <span>{{ data.approval }}</span>
                  <span v-if="data.hasCondition">条件节点</span>
                </em>
              </span>
              <span class="workflow-canvas-editor__node-order">{{ data.order }}</span>
              <span class="workflow-canvas-editor__node-drag-hint" aria-hidden="true">
                <ArtSvgIcon icon="ri:draggable" />自由拖放 · 序号 {{ data.order }} 决定顺序
              </span>
              <Handle
                type="source"
                :position="canvasDirection === 'vertical' ? Position.Bottom : Position.Right"
              />
            </button>
          </template>

          <MiniMap
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
            :fit-view-params="{ padding: 0.2, maxZoom: 1 }"
          />
        </VueFlow>

        <div
          v-if="contextMenu.visible"
          ref="contextMenuRef"
          class="workflow-canvas-editor__context-menu"
          :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
          role="menu"
          aria-label="流程节点快捷操作"
          @contextmenu.prevent
        >
          <header>
            <span>{{ contextMenuTitle }}</span>
            <small>节点与画布操作</small>
          </header>
          <button
            v-for="action in contextMenuActions"
            :key="action.key"
            type="button"
            role="menuitem"
            :disabled="action.disabled"
            :class="{
              'is-danger': action.danger,
              'has-divider': action.dividerBefore
            }"
            @click="handleContextAction(action.key)"
          >
            <ArtSvgIcon :icon="action.icon" />
            <span>{{ action.label }}</span>
            <kbd v-if="action.shortcut">{{ action.shortcut }}</kbd>
          </button>
        </div>
      </div>

      <aside v-if="inspectorVisible && selectedNode" class="workflow-canvas-editor__inspector">
        <header>
          <span aria-hidden="true"><ArtSvgIcon icon="ri:user-settings-line" /></span>
          <div>
            <strong>{{ selectedNode.name || `审批节点 ${selectedIndex + 1}` }}</strong>
            <small>节点 {{ selectedIndex + 1 }} · 设置审批人与流转规则</small>
          </div>
        </header>

        <ElScrollbar always>
          <div class="workflow-canvas-editor__inspector-content">
            <ElAlert
              v-if="!tenantId"
              class="workflow-canvas-editor__tenant-alert"
              type="warning"
              :closable="false"
              show-icon
              title="选择租户后才能加载审批成员和角色"
            />
            <ElTabs v-model="activeInspectorTab">
              <ElTabPane label="审批设置" name="approval">
                <ArtForm
                  ref="approvalFormRef"
                  v-model="selectedNode"
                  :items="approvalItems"
                  :span="24"
                  label-position="top"
                  :show-reset="false"
                  :show-submit="false"
                />
              </ElTabPane>
              <ElTabPane label="时效与条件" name="rules">
                <ArtForm
                  v-model="selectedNode"
                  :items="ruleItems"
                  :span="24"
                  label-position="top"
                  :show-reset="false"
                  :show-submit="false"
                />
              </ElTabPane>
            </ElTabs>
          </div>
        </ElScrollbar>
      </aside>

      <aside v-else-if="inspectorVisible" class="workflow-canvas-editor__inspector is-empty">
        <ArtEmptyState
          title="选择审批节点"
          description="点击画布中的审批节点后，可在这里配置审批人、时限与条件。"
          size="compact"
          :visual-size="78"
        />
      </aside>
    </div>
  </ArtSectionCard>
</template>

<script setup lang="ts">
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import {
    Handle,
    MarkerType,
    Position,
    VueFlow,
    useVueFlow,
    type Edge,
    type Node,
    type NodeDragEvent,
    type NodeMouseEvent
  } from '@vue-flow/core'
  import { Background } from '@vue-flow/background'
  import { Controls } from '@vue-flow/controls'
  import { MiniMap } from '@vue-flow/minimap'
  import { onClickOutside, usePreferredReducedMotion } from '@vueuse/core'
  import { cloneDeep, isEqual, trim } from 'lodash-es'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtSectionTitle from '@/components/core/surfaces/art-section-title/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import { useUserStore } from '@/store/modules/user'
  import { fetchWorkflowRoleOptions, fetchWorkflowUserOptions } from '@/api/workflow'
  import { getWorkflowBusinessContract } from '../../modules/workflow-business-contracts'
  import {
    WORKFLOW_END_NODE_KEY,
    WORKFLOW_START_NODE_KEY,
    createWorkflowCanvasLayout,
    normalizeWorkflowCanvasLayout,
    updateWorkflowCanvasPosition
  } from './workflow-layout'
  import { createWorkflowNode } from './workflow-templates'
  import '@vue-flow/core/dist/style.css'
  import '@vue-flow/core/dist/theme-default.css'

  defineOptions({ name: 'WorkflowCanvasEditor' })

  interface FlowNodeData extends Record<string, unknown> {
    kind: 'start' | 'approval' | 'end'
    key: string
    label: string
    description?: string
    icon?: string
    order?: number
    assignee?: string
    approval?: string
    hasCondition?: boolean
  }

  interface FormExpose {
    reloadOptions: (key?: string) => Promise<void>
  }

  type ContextMenuTarget = FlowNodeData['kind'] | 'pane'
  type ContextMenuActionKey =
    | 'add'
    | 'insert-before'
    | 'insert-after'
    | 'duplicate'
    | 'move-left'
    | 'move-right'
    | 'show-inspector'
    | 'fit-view'
    | 'layout-horizontal'
    | 'layout-vertical'
    | 'delete'

  interface ContextMenuAction {
    key: ContextMenuActionKey
    label: string
    icon: string
    shortcut?: string
    disabled?: boolean
    danger?: boolean
    dividerBefore?: boolean
  }

  interface ContextMenuState {
    visible: boolean
    x: number
    y: number
    target: ContextMenuTarget
    nodeKey: string | null
  }

  interface WorkflowCanvasSnapshot {
    nodes: Api.Workflow.WorkflowNode[]
    layout?: Api.Workflow.WorkflowCanvasLayout
  }

  interface HistoryGroup {
    undo: WorkflowCanvasSnapshot[]
    redo: WorkflowCanvasSnapshot[]
  }

  const props = defineProps<{ tenantId?: string; businessType: string }>()
  const emit = defineEmits<{ 'request-step': [step: 1] }>()
  const config = defineModel<Api.Workflow.WorkflowConfig>({ required: true })
  const nodes = computed<Api.Workflow.WorkflowNode[]>({
    get: () => config.value.nodes,
    set: (value) => {
      config.value.nodes = value
    }
  })
  const { getDictMap } = storeToRefs(useUserStore())
  const { fitView } = useVueFlow('workflow-designer-flow')
  const reducedMotion = usePreferredReducedMotion()
  const approvalFormRef = ref<FormExpose>()
  const contextMenuRef = ref<HTMLElement>()
  const selectedNodeKey = ref<string | null>(nodes.value[0]?.key ?? null)
  const activeInspectorTab = ref<'approval' | 'rules'>('approval')
  const interactionMode = ref<'select' | 'pan'>('select')
  const layoutLocked = ref(false)
  const inspectorVisible = ref(true)
  const flowNodes = shallowRef<Node<FlowNodeData>[]>([])
  const dragSnapshot = shallowRef<WorkflowCanvasSnapshot>()
  const history = reactive<HistoryGroup>({ undo: [], redo: [] })
  const contextMenu = reactive<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    target: 'pane',
    nodeKey: null
  })

  const selectedIndex = computed(() =>
    nodes.value.findIndex((node) => node.key === selectedNodeKey.value)
  )
  const selectedNode = computed<Api.Workflow.WorkflowNode | undefined>({
    get: () => nodes.value[selectedIndex.value],
    set: (value) => {
      if (value && selectedIndex.value >= 0) nodes.value.splice(selectedIndex.value, 1, value)
    }
  })
  const contextFields = computed(() => getWorkflowBusinessContract(props.businessType).fields)
  const contextFieldOptions = computed(() =>
    contextFields.value.map((field) => ({
      label: `${field.label}（${field.key}）`,
      value: field.key
    }))
  )
  const configuredNodeCount = computed(
    () =>
      nodes.value.filter((node) => {
        const assigneeCount =
          node.assignee.type === 'users'
            ? node.assignee.userIds?.length
            : node.assignee.roleCodes?.length
        return (
          Boolean(trim(node.name)) && (node.assignee.type === 'initiator' || Boolean(assigneeCount))
        )
      }).length
  )
  const flowAriaLabel = computed(
    () => `审批流程画布，共 ${nodes.value.length} 个审批节点，可自由拖动；卡片序号决定审批顺序`
  )
  const canUndo = computed(() => history.undo.length > 0)
  const canRedo = computed(() => history.redo.length > 0)
  const layoutMode = computed(() => config.value.layout?.mode ?? 'horizontal')
  const canvasDirection = computed<'horizontal' | 'vertical'>(() => {
    if (layoutMode.value !== 'free') return layoutMode.value
    const layout = normalizeWorkflowCanvasLayout(config.value.layout, nodes.value)
    const start = layout.positions[WORKFLOW_START_NODE_KEY]
    const end = layout.positions[WORKFLOW_END_NODE_KEY]
    return Math.abs(end.y - start.y) > Math.abs(end.x - start.x) ? 'vertical' : 'horizontal'
  })
  const nodesDraggable = computed(() => interactionMode.value === 'select' && !layoutLocked.value)
  const contextMenuTitle = computed(() => {
    if (contextMenu.target === 'start') return '发起节点'
    if (contextMenu.target === 'end') return '结束节点'
    if (contextMenu.target === 'pane') return '流程画布'
    return nodes.value.find((node) => node.key === contextMenu.nodeKey)?.name || '审批节点'
  })
  const contextMenuActions = computed<ContextMenuAction[]>(() => {
    const canvasActions: ContextMenuAction[] = [
      {
        key: 'show-inspector',
        label: inspectorVisible.value ? '收起属性面板' : '显示属性面板',
        icon: 'ri:sidebar-fold-line',
        dividerBefore: true
      },
      { key: 'fit-view', label: '适配画布', icon: 'ri:fullscreen-line' },
      { key: 'layout-horizontal', label: '横向整理', icon: 'ri:organization-chart' },
      { key: 'layout-vertical', label: '纵向整理', icon: 'ri:node-tree' }
    ]
    if (contextMenu.target === 'pane') {
      return [{ key: 'add', label: '新增审批节点', icon: 'ri:add-circle-line' }, ...canvasActions]
    }
    if (contextMenu.target === 'start') {
      return [
        { key: 'insert-after', label: '在发起后插入节点', icon: 'ri:insert-column-right' },
        ...canvasActions
      ]
    }
    if (contextMenu.target === 'end') {
      return [
        { key: 'insert-before', label: '在结束前插入节点', icon: 'ri:insert-column-left' },
        ...canvasActions
      ]
    }
    return [
      { key: 'insert-before', label: '在前面插入节点', icon: 'ri:insert-column-left' },
      { key: 'insert-after', label: '在后面插入节点', icon: 'ri:insert-column-right' },
      { key: 'duplicate', label: '复制节点', icon: 'ri:file-copy-line', shortcut: 'Ctrl+D' },
      {
        key: 'move-left',
        label: '审批顺序前移',
        icon: 'ri:arrow-up-line',
        disabled: selectedIndex.value <= 0,
        dividerBefore: true
      },
      {
        key: 'move-right',
        label: '审批顺序后移',
        icon: 'ri:arrow-down-line',
        disabled: selectedIndex.value < 0 || selectedIndex.value >= nodes.value.length - 1
      },
      ...canvasActions,
      {
        key: 'delete',
        label: '删除节点',
        icon: 'ri:delete-bin-6-line',
        shortcut: 'Delete',
        danger: true,
        dividerBefore: true
      }
    ]
  })

  const dictOptions = (code: string) => getDictMap.value[code] ?? []
  const approvalItems = computed<FormItem[]>(() => {
    const node = selectedNode.value
    const assigneeType = node?.assignee.type
    const approvalMode = node?.approvalMode
    return [
      {
        label: '节点名称',
        key: 'name',
        type: 'input',
        props: { maxlength: 80, placeholder: '例如 财务负责人审批' }
      },
      {
        label: '多人审批方式',
        key: 'approvalMode',
        type: 'select',
        help:
          approvalMode === 'all'
            ? '所有审批人通过后才进入下一节点。'
            : '或签满足一人通过；比例会签按实际人数向上取整。',
        props: { options: dictOptions('workflowApprovalMode') }
      },
      {
        label: '通过比例（%）',
        key: 'approvalThresholdPercent',
        type: 'number',
        hidden: approvalMode !== 'percentage',
        props: { min: 1, max: 100, precision: 0, controlsPosition: 'right', class: '!w-full' }
      },
      {
        label: '驳回策略',
        key: 'rejectVetoEnabled',
        type: 'switch',
        hidden: approvalMode === 'all',
        props: { activeText: '一票否决', inactiveText: '容错计算', inlinePrompt: true }
      },
      {
        label: '审批人来源',
        key: 'assignee.type',
        type: 'select',
        help: '角色会在流程启动时解析为当前租户内的有效用户。',
        props: { options: dictOptions('workflowAssigneeType') }
      },
      {
        label: '指定成员',
        key: 'assignee.userIds',
        type: 'userSelect',
        hidden: assigneeType !== 'users',
        help: props.tenantId
          ? '仅展示当前流程所属租户的有效成员。'
          : '请先在基础信息中选择所属租户。',
        api: fetchWorkflowUserOptions,
        immediate: false,
        beforeFetch: (params) => ({ ...params, tenantId: props.tenantId }),
        shouldFetch: () => Boolean(props.tenantId),
        resultField: 'data',
        valueField: 'id',
        labelFn: (option) =>
          String(option.nickName || option.userName || option.userEmail || option.id),
        props: {
          multiple: true,
          filterable: true,
          collapseTags: true,
          collapseTagsTooltip: true,
          disabled: !props.tenantId,
          placeholder: props.tenantId ? '搜索并选择租户成员' : '请先选择所属租户',
          noDataText: props.tenantId ? '该租户暂无可选成员' : '请先选择所属租户'
        }
      },
      {
        label: '指定角色',
        key: 'assignee.roleCodes',
        type: 'select',
        hidden: assigneeType !== 'roles',
        help: props.tenantId
          ? '角色会在流程启动时解析为该租户内的有效成员。'
          : '请先在基础信息中选择所属租户。',
        api: fetchWorkflowRoleOptions,
        immediate: false,
        beforeFetch: (params) => ({ ...params, tenantId: props.tenantId }),
        shouldFetch: () => Boolean(props.tenantId),
        resultField: 'data',
        labelField: 'roleName',
        valueField: 'roleCode',
        props: {
          multiple: true,
          filterable: true,
          collapseTags: true,
          collapseTagsTooltip: true,
          disabled: !props.tenantId,
          placeholder: props.tenantId ? '搜索并选择租户角色' : '请先选择所属租户',
          noDataText: props.tenantId ? '该租户暂无可选角色' : '请先选择所属租户'
        }
      },
      {
        label: '发起人与审批人相同',
        key: 'allowSelfApproval',
        type: 'switch',
        help: '默认禁止自审，保持审批职责分离。',
        props: { activeText: '允许自审', inactiveText: '禁止自审', inlinePrompt: true }
      }
    ]
  })

  const ruleItems = computed<FormItem[]>(() => {
    const conditionOperator = selectedNode.value?.condition.operator
    return [
      {
        label: '审批时限（小时）',
        key: 'dueHours',
        type: 'number',
        props: { min: 1, max: 720, precision: 0, controlsPosition: 'right', class: '!w-full' }
      },
      {
        label: '到期前提醒（分钟）',
        key: 'reminderBeforeMinutes',
        type: 'number',
        help: '设为 0 表示不发送到期前提醒。',
        props: { min: 0, max: 10080, precision: 0, controlsPosition: 'right', class: '!w-full' }
      },
      {
        label: '超时升级',
        key: 'escalationEnabled',
        type: 'switch',
        props: { activeText: '开启', inactiveText: '关闭', inlinePrompt: true }
      },
      {
        label: '升级管理员（超时小时）',
        key: 'escalateAfterHours',
        type: 'number',
        hidden: !selectedNode.value?.escalationEnabled,
        props: { min: 1, max: 720, precision: 0, controlsPosition: 'right', class: '!w-full' }
      },
      {
        label: '进入条件',
        key: 'condition.operator',
        type: 'select',
        help: '条件不满足时跳过本节点，并继续检查后续节点。',
        props: { options: dictOptions('workflowConditionOperator') }
      },
      {
        label: '业务字段',
        key: 'condition.field',
        type: 'select',
        hidden: conditionOperator === 'always',
        props: {
          options: contextFieldOptions.value,
          filterable: true,
          placeholder: '选择受控业务字段'
        }
      },
      {
        label: '比较值',
        key: 'condition.value',
        type: 'input',
        hidden: ['always', 'not_empty'].includes(String(conditionOperator)),
        help: '属于（in）运算可用英文逗号分隔多个值。',
        props: { placeholder: '填写数字或文本比较值' }
      }
    ]
  })

  const flowEdges = computed((): Edge[] => {
    const edges: Edge[] = []
    for (const [index, node] of flowNodes.value.slice(0, -1).entries()) {
      const target = flowNodes.value[index + 1]
      if (!target) continue
      edges.push({
        id: `${node.id}-${target.id}`,
        source: node.id,
        target: target.id,
        type: 'smoothstep',
        selectable: false,
        focusable: false,
        style: { stroke: 'var(--el-border-color)', strokeWidth: 1.7 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: 'var(--el-border-color)',
          width: 18,
          height: 18
        }
      })
    }
    return edges
  })

  function getAssigneeSummary(node: Api.Workflow.WorkflowNode): string {
    if (node.assignee.type === 'initiator') return '发起人'
    const count =
      node.assignee.type === 'users'
        ? (node.assignee.userIds?.length ?? 0)
        : (node.assignee.roleCodes?.length ?? 0)
    return count
      ? `${count} 个${node.assignee.type === 'users' ? '成员' : '角色'}`
      : '未配置审批对象'
  }

  function getApprovalSummary(node: Api.Workflow.WorkflowNode): string {
    if (node.approvalMode === 'all') return '会签'
    if (node.approvalMode === 'percentage') return `${node.approvalThresholdPercent}% 通过`
    return '或签'
  }

  function syncFlowNodes(): void {
    const layout = normalizeWorkflowCanvasLayout(config.value.layout, nodes.value)
    flowNodes.value = [
      {
        id: WORKFLOW_START_NODE_KEY,
        type: 'terminal',
        position: layout.positions[WORKFLOW_START_NODE_KEY],
        draggable: nodesDraggable.value,
        selectable: false,
        connectable: false,
        data: {
          kind: 'start',
          key: WORKFLOW_START_NODE_KEY,
          label: '发起',
          description: '申请提交',
          icon: 'ri:play-circle-line'
        }
      },
      ...nodes.value.map((node, index): Node<FlowNodeData> => ({
        id: node.key,
        type: 'approval',
        position: layout.positions[node.key],
        draggable: nodesDraggable.value,
        selectable: false,
        connectable: false,
        data: {
          kind: 'approval',
          key: node.key,
          label: node.name || `审批节点 ${index + 1}`,
          order: index + 1,
          assignee: getAssigneeSummary(node),
          approval: getApprovalSummary(node),
          hasCondition: node.condition.operator !== 'always'
        }
      })),
      {
        id: WORKFLOW_END_NODE_KEY,
        type: 'terminal',
        position: layout.positions[WORKFLOW_END_NODE_KEY],
        draggable: nodesDraggable.value,
        selectable: false,
        connectable: false,
        data: {
          kind: 'end',
          key: WORKFLOW_END_NODE_KEY,
          label: '结束',
          description: '流程归档',
          icon: 'ri:checkbox-circle-line'
        }
      }
    ]
  }

  function normalizeOrder(): void {
    nodes.value.forEach((node, index) => (node.order = index + 1))
  }

  function createCanvasSnapshot(): WorkflowCanvasSnapshot {
    return {
      nodes: cloneDeep(toRaw(nodes.value)),
      layout: cloneDeep(toRaw(config.value.layout))
    }
  }

  function pushUndo(snapshot: WorkflowCanvasSnapshot = createCanvasSnapshot()): void {
    history.undo.push(cloneDeep(snapshot))
    if (history.undo.length > 30) history.undo.shift()
    history.redo = []
  }

  function refreshLayoutAfterStructureChange(): void {
    const mode = config.value.layout?.mode ?? 'horizontal'
    config.value.layout =
      mode === 'free'
        ? normalizeWorkflowCanvasLayout(config.value.layout, nodes.value)
        : createWorkflowCanvasLayout(nodes.value, mode)
  }

  function applyStructuralChange(change: () => void): void {
    pushUndo()
    change()
    normalizeOrder()
    refreshLayoutAfterStructureChange()
  }

  function addNodeAt(index: number): void {
    const boundedIndex = Math.max(0, Math.min(index, nodes.value.length))
    const node = createWorkflowNode(`审批节点 ${nodes.value.length + 1}`, boundedIndex)
    applyStructuralChange(() => nodes.value.splice(boundedIndex, 0, node))
    selectedNodeKey.value = node.key
    activeInspectorTab.value = 'approval'
    inspectorVisible.value = true
    closeContextMenu()
  }

  function addNode(): void {
    addNodeAt(nodes.value.length)
  }

  function removeSelected(): void {
    if (selectedIndex.value < 0) return
    const removedName = selectedNode.value?.name || `审批节点 ${selectedIndex.value + 1}`
    const removedIndex = selectedIndex.value
    applyStructuralChange(() => nodes.value.splice(removedIndex, 1))
    selectedNodeKey.value = nodes.value[Math.min(removedIndex, nodes.value.length - 1)]?.key ?? null
    closeContextMenu()
    ElMessage.success(`已删除“${removedName}”，可使用撤销恢复`)
  }

  function duplicateSelected(): void {
    if (!selectedNode.value || selectedIndex.value < 0) return
    const duplicate = cloneDeep(toRaw(selectedNode.value))
    duplicate.key = createWorkflowNode('', 0).key
    duplicate.name = `${duplicate.name || `审批节点 ${selectedIndex.value + 1}`} 副本`
    const insertIndex = selectedIndex.value + 1
    applyStructuralChange(() => nodes.value.splice(insertIndex, 0, duplicate))
    selectedNodeKey.value = duplicate.key
    closeContextMenu()
  }

  function moveSelected(offset: -1 | 1): void {
    const from = selectedIndex.value
    const to = from + offset
    if (from < 0 || to < 0 || to >= nodes.value.length) return
    applyStructuralChange(() => {
      const [node] = nodes.value.splice(from, 1)
      nodes.value.splice(to, 0, node)
    })
    closeContextMenu()
  }

  function handleNodeClick({ node }: NodeMouseEvent): void {
    const data = node.data as FlowNodeData
    if (data.kind === 'approval') selectedNodeKey.value = data.key
    closeContextMenu()
  }

  function handleNodeDragStart({ node }: NodeDragEvent): void {
    const data = node.data as FlowNodeData
    if (data.kind === 'approval') selectedNodeKey.value = data.key
    dragSnapshot.value = createCanvasSnapshot()
    closeContextMenu()
  }

  function handleNodeDragStop({ node }: NodeDragEvent): void {
    const currentLayout = normalizeWorkflowCanvasLayout(config.value.layout, nodes.value)
    const currentPosition = currentLayout.positions[node.id]
    const nextLayout = updateWorkflowCanvasPosition(
      config.value.layout,
      nodes.value,
      node.id,
      node.position
    )
    if (isEqual(currentPosition, nextLayout.positions[node.id])) {
      dragSnapshot.value = undefined
      syncFlowNodes()
      return
    }
    pushUndo(dragSnapshot.value || createCanvasSnapshot())
    config.value.layout = nextLayout
    dragSnapshot.value = undefined
  }

  async function fitCanvas(): Promise<void> {
    closeContextMenu()
    await nextTick()
    await fitView({
      padding: 0.18,
      maxZoom: 1,
      duration: reducedMotion.value === 'reduce' ? 0 : 220
    })
  }

  async function arrangeCanvas(mode: 'horizontal' | 'vertical'): Promise<void> {
    const nextLayout = createWorkflowCanvasLayout(nodes.value, mode)
    if (!isEqual(normalizeWorkflowCanvasLayout(config.value.layout, nodes.value), nextLayout)) {
      pushUndo()
      config.value.layout = nextLayout
    }
    closeContextMenu()
    await fitCanvas()
  }

  function restoreCanvasSnapshot(snapshot: WorkflowCanvasSnapshot): void {
    nodes.value = cloneDeep(snapshot.nodes)
    config.value.layout = cloneDeep(snapshot.layout)
    normalizeOrder()
    if (!nodes.value.some((node) => node.key === selectedNodeKey.value)) {
      selectedNodeKey.value = nodes.value[0]?.key ?? null
    }
  }

  function undoStructure(): void {
    const snapshot = history.undo.pop()
    if (!snapshot) return
    history.redo.push(createCanvasSnapshot())
    restoreCanvasSnapshot(snapshot)
    closeContextMenu()
  }

  function redoStructure(): void {
    const snapshot = history.redo.pop()
    if (!snapshot) return
    history.undo.push(createCanvasSnapshot())
    restoreCanvasSnapshot(snapshot)
    closeContextMenu()
  }

  function showContextMenu(event: MouseEvent, target: ContextMenuTarget, nodeKey?: string): void {
    event.preventDefault()
    const menuWidth = 224
    const estimatedHeight = target === 'approval' ? 510 : 320
    Object.assign(contextMenu, {
      visible: true,
      x: Math.max(12, Math.min(event.clientX, window.innerWidth - menuWidth - 12)),
      y: Math.max(12, Math.min(event.clientY, window.innerHeight - estimatedHeight - 12)),
      target,
      nodeKey: nodeKey || null
    })
    void nextTick(() => contextMenuRef.value?.querySelector<HTMLButtonElement>('button')?.focus())
  }

  function handleNodeContextMenu({ event, node }: NodeMouseEvent): void {
    if (!(event instanceof MouseEvent)) return
    const data = node.data as FlowNodeData
    if (data.kind === 'approval') selectedNodeKey.value = data.key
    showContextMenu(event, data.kind, data.kind === 'approval' ? data.key : undefined)
  }

  function handlePaneContextMenu(event: MouseEvent): void {
    showContextMenu(event, 'pane')
  }

  function closeContextMenu(): void {
    contextMenu.visible = false
  }

  function handleContextAction(action: ContextMenuActionKey): void {
    if (contextMenu.nodeKey) selectedNodeKey.value = contextMenu.nodeKey
    const targetIndex = selectedIndex.value
    const actions: Record<ContextMenuActionKey, () => void> = {
      add: () => addNode(),
      'insert-before': () =>
        addNodeAt(contextMenu.target === 'end' ? nodes.value.length : targetIndex),
      'insert-after': () => addNodeAt(contextMenu.target === 'start' ? 0 : targetIndex + 1),
      duplicate: () => duplicateSelected(),
      'move-left': () => moveSelected(-1),
      'move-right': () => moveSelected(1),
      'show-inspector': () => {
        inspectorVisible.value = !inspectorVisible.value
        closeContextMenu()
      },
      'fit-view': () => void fitCanvas(),
      'layout-horizontal': () => void arrangeCanvas('horizontal'),
      'layout-vertical': () => void arrangeCanvas('vertical'),
      delete: () => removeSelected()
    }
    actions[action]()
  }

  function isTextEntryTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false
    return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
  }

  function handleWorkspaceKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      closeContextMenu()
      return
    }
    if (isTextEntryTarget(event.target)) return
    const modifier = event.ctrlKey || event.metaKey
    const key = event.key.toLocaleLowerCase()
    if (modifier && key === 'z') {
      event.preventDefault()
      if (event.shiftKey) redoStructure()
      else undoStructure()
      return
    }
    if (modifier && key === 'd') {
      event.preventDefault()
      duplicateSelected()
      return
    }
    if (event.altKey && event.key === 'ArrowLeft') {
      event.preventDefault()
      moveSelected(-1)
      return
    }
    if (event.altKey && event.key === 'ArrowRight') {
      event.preventDefault()
      moveSelected(1)
      return
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      removeSelected()
    }
  }

  async function reloadAssigneeOptions(): Promise<void> {
    await nextTick()
    await Promise.all([
      approvalFormRef.value?.reloadOptions('assignee.userIds'),
      approvalFormRef.value?.reloadOptions('assignee.roleCodes')
    ])
  }

  watch(
    [config, nodesDraggable],
    () => {
      if (
        selectedNodeKey.value &&
        !nodes.value.some((node) => node.key === selectedNodeKey.value)
      ) {
        selectedNodeKey.value = nodes.value[0]?.key ?? null
      }
      syncFlowNodes()
    },
    { deep: true, immediate: true }
  )
  watch(
    () => [selectedNodeKey.value, props.tenantId, selectedNode.value?.assignee.type],
    () => {
      if (props.tenantId) void reloadAssigneeOptions()
    },
    { immediate: true }
  )

  onClickOutside(contextMenuRef, closeContextMenu)

  function selectNode(nodeKey: string): void {
    if (!nodes.value.some((node) => node.key === nodeKey)) return
    selectedNodeKey.value = nodeKey
    activeInspectorTab.value = 'approval'
    inspectorVisible.value = true
  }

  defineExpose({ selectNode })
</script>

<style scoped lang="scss">
  .workflow-canvas-editor {
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    min-width: 0;
    min-height: 0;
    padding: var(--art-space-4);

    &__toolbar {
      display: flex;
      gap: var(--art-space-4);
      align-items: flex-start;
      justify-content: space-between;
      padding-bottom: var(--art-space-4);

      p {
        margin: 4px 0 0;
        font-size: 12px;
        color: var(--art-gray-600);
      }
    }

    &__toolbar-actions {
      display: flex;
      flex: none;
      gap: var(--art-space-2);
      align-items: center;
    }

    &__guide {
      display: flex;
      gap: 8px;
      align-items: center;
      min-height: 36px;
      padding: 7px 12px;
      margin-bottom: var(--art-space-3);
      font-size: 12px;
      color: var(--art-gray-700);
      background: color-mix(in srgb, var(--theme-color) 6%, var(--el-bg-color));
      border-radius: var(--el-border-radius-base);

      > svg {
        flex: none;
        color: var(--theme-color);
      }

      > span {
        min-width: 0;
      }

      .el-button {
        flex: none;
        margin-left: auto;
      }

      &.is-warning {
        color: var(--el-color-warning-dark-2);
        background: var(--el-color-warning-light-9);

        > svg {
          color: var(--el-color-warning);
        }
      }
    }

    &__workspace {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      min-width: 0;
      min-height: 540px;
      overflow: hidden;
      background: var(--el-fill-color-extra-light);
      border: 1px solid var(--art-gray-200);
      border-radius: var(--el-border-radius-base);

      &:focus-visible {
        outline: 2px solid color-mix(in srgb, var(--theme-color) 36%, transparent);
        outline-offset: 2px;
      }

      &.has-inspector {
        grid-template-columns: minmax(0, 1fr) 340px;
      }

      &.is-pan-mode {
        .workflow-canvas-editor__canvas,
        :deep(.vue-flow__node) {
          cursor: grab;
        }

        .workflow-canvas-editor__canvas:active {
          cursor: grabbing;
        }
      }

      &.is-layout-locked {
        .workflow-canvas-editor__terminal,
        .workflow-canvas-editor__node {
          cursor: default;
        }
      }
    }

    &__canvas {
      position: relative;
      min-width: 0;
      min-height: 0;
      background: color-mix(in srgb, var(--el-fill-color-extra-light) 70%, var(--el-bg-color));
    }

    &__canvas-toolbar {
      position: absolute;
      top: 12px;
      left: 12px;
      z-index: 12;
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
      max-width: calc(100% - 24px);
      padding: 5px;
      background: color-mix(in srgb, var(--el-bg-color-overlay) 96%, transparent);
      border: 1px solid var(--art-gray-200);
      border-radius: var(--el-border-radius-base);
      box-shadow: 0 6px 18px rgb(31 45 61 / 8%);

      &-divider {
        flex: none;
        width: 1px;
        height: 22px;
        margin: 0 2px;
        background: var(--art-gray-200);
      }

      :deep(.el-button) {
        min-width: 32px;
        min-height: 32px;
        padding: 7px;
      }
    }

    &__terminal {
      display: flex;
      gap: 12px;
      align-items: center;
      width: 162px;
      min-height: 84px;
      padding: 14px;
      cursor: grab;
      background: var(--el-bg-color);
      border: 1px solid var(--art-gray-200);
      border-radius: var(--el-border-radius-base);
      box-shadow: 0 7px 20px rgb(31 45 61 / 6%);

      &:hover {
        border-color: color-mix(in srgb, var(--theme-color) 42%, var(--art-gray-200));
      }

      > span {
        display: grid;
        flex: none;
        place-items: center;
        width: 36px;
        height: 36px;
        font-size: 18px;
        color: var(--el-color-success);
        background: var(--el-color-success-light-9);
        border-radius: var(--el-border-radius-base);

        &.is-end {
          color: var(--theme-color);
          background: color-mix(in srgb, var(--theme-color) 10%, var(--el-bg-color));
        }
      }

      > div {
        display: grid;
        gap: 4px;
      }

      strong {
        color: var(--art-gray-900);
      }

      small {
        font-size: 11px;
        color: var(--art-gray-600);
      }
    }

    &__node {
      position: relative;
      display: grid;
      grid-template-columns: 38px minmax(0, 1fr) 24px;
      gap: 11px;
      align-items: start;
      width: 246px;
      min-height: 136px;
      padding: 15px;
      color: inherit;
      text-align: left;
      cursor: grab;
      background: var(--el-bg-color);
      border: 1px solid var(--art-gray-200);
      border-radius: var(--el-border-radius-base);
      box-shadow: 0 7px 20px rgb(31 45 61 / 6%);
      transition:
        border-color var(--art-motion-duration-fast) ease,
        box-shadow var(--art-motion-duration-fast) ease,
        transform var(--art-motion-duration-fast) ease;

      &:hover,
      &:focus-visible,
      &.is-selected {
        border-color: var(--theme-color);
        transform: translateY(-1px);
      }

      &:focus-visible {
        outline: 2px solid color-mix(in srgb, var(--theme-color) 40%, transparent);
        outline-offset: 2px;
      }

      &:active {
        cursor: grabbing;
      }
    }

    &__node-icon {
      display: grid;
      place-items: center;
      width: 38px;
      height: 38px;
      font-size: 18px;
      color: var(--theme-color);
      background: color-mix(in srgb, var(--theme-color) 10%, var(--el-bg-color));
      border-radius: var(--el-border-radius-base);
    }

    &__node-copy {
      display: grid;
      gap: 6px;
      min-width: 0;

      strong,
      small {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      strong {
        color: var(--art-gray-900);
      }

      small {
        font-size: 11px;
        color: var(--art-gray-600);
      }

      em {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
        margin-top: 3px;
        font-style: normal;

        span {
          padding: 3px 7px;
          font-size: 10px;
          color: var(--art-gray-700);
          background: var(--art-gray-100);
          border-radius: var(--el-border-radius-small);
        }
      }
    }

    &__node-order {
      display: grid;
      place-items: center;
      width: 22px;
      height: 22px;
      font-size: 11px;
      color: var(--theme-color);
      background: color-mix(in srgb, var(--theme-color) 10%, var(--el-bg-color));
      border-radius: 50%;
    }

    &__node-drag-hint {
      display: flex;
      grid-column: 1 / -1;
      gap: 5px;
      align-items: center;
      padding-top: 8px;
      margin-top: 3px;
      font-size: 10px;
      color: var(--art-gray-500);
      border-top: 1px dashed var(--art-gray-200);

      svg {
        font-size: 13px;
      }
    }

    &__context-menu {
      position: fixed;
      z-index: 3000;
      width: 224px;
      padding: 7px;
      background: var(--el-bg-color-overlay);
      border: 1px solid var(--art-gray-200);
      border-radius: var(--el-border-radius-base);
      box-shadow: var(--el-box-shadow-light);

      > header {
        display: grid;
        gap: 2px;
        padding: 7px 9px 9px;

        span {
          overflow: hidden;
          text-overflow: ellipsis;
          font-size: 12px;
          font-weight: 600;
          color: var(--art-gray-900);
          white-space: nowrap;
        }

        small {
          font-size: 10px;
          color: var(--art-gray-500);
        }
      }

      > button {
        display: grid;
        grid-template-columns: 20px minmax(0, 1fr) auto;
        gap: 8px;
        align-items: center;
        width: 100%;
        min-height: 36px;
        padding: 7px 9px;
        color: var(--art-gray-700);
        text-align: left;
        cursor: pointer;
        background: transparent;
        border: 0;
        border-radius: var(--el-border-radius-small);
        transition:
          color var(--art-motion-duration-fast) ease,
          background-color var(--art-motion-duration-fast) ease;

        svg {
          font-size: 16px;
        }

        kbd {
          font-family: inherit;
          font-size: 10px;
          color: var(--art-gray-500);
        }

        &:hover,
        &:focus-visible {
          color: var(--theme-color);
          background: color-mix(in srgb, var(--theme-color) 9%, var(--el-bg-color));
        }

        &:focus-visible {
          outline: 2px solid color-mix(in srgb, var(--theme-color) 35%, transparent);
          outline-offset: -2px;
        }

        &:disabled {
          color: var(--art-gray-400);
          pointer-events: none;
          cursor: not-allowed;
        }

        &.has-divider {
          margin-top: 5px;
          border-top: 1px solid var(--art-gray-200);
          border-radius: 0 0 var(--el-border-radius-small) var(--el-border-radius-small);
        }

        &.is-danger:not(:disabled) {
          color: var(--el-color-danger);

          &:hover,
          &:focus-visible {
            background: var(--el-color-danger-light-9);
          }
        }
      }
    }

    &__inspector {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      min-width: 0;
      min-height: 0;
      background: var(--el-bg-color);
      border-left: 1px solid var(--art-gray-200);

      > header {
        display: flex;
        gap: 10px;
        align-items: center;
        padding: var(--art-space-4);
        border-bottom: 1px solid var(--art-gray-200);

        > span {
          display: grid;
          flex: none;
          place-items: center;
          width: 34px;
          height: 34px;
          color: var(--theme-color);
          background: color-mix(in srgb, var(--theme-color) 10%, var(--el-bg-color));
          border-radius: var(--el-border-radius-base);
        }

        > div {
          display: grid;
          gap: 2px;
          min-width: 0;
        }

        strong,
        small {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        strong {
          color: var(--art-gray-900);
        }

        small {
          font-size: 11px;
          color: var(--art-gray-600);
        }
      }

      &.is-empty {
        grid-template-rows: minmax(0, 1fr);
        place-items: center;
        padding: var(--art-space-5);
      }
    }

    &__inspector-content {
      padding: 0 var(--art-space-4) var(--art-space-4);
    }

    &__tenant-alert {
      margin-top: var(--art-space-3);
    }

    :deep(.vue-flow__node) {
      background: transparent;
      border: 0;
    }

    :deep(.vue-flow__node.dragging) {
      z-index: 20 !important;
      opacity: 0.92;

      .workflow-canvas-editor__node {
        cursor: grabbing;
        box-shadow: var(--el-box-shadow-light);
        transform: translateY(-3px);
      }

      .workflow-canvas-editor__terminal {
        cursor: grabbing;
        box-shadow: var(--el-box-shadow-light);
        transform: translateY(-3px);
      }
    }

    :deep(.vue-flow__handle) {
      width: 8px;
      height: 8px;
      pointer-events: none;
      background: var(--el-bg-color);
      border: 2px solid var(--theme-color);
    }

    :deep(.vue-flow__controls),
    :deep(.vue-flow__minimap) {
      overflow: hidden;
      background: var(--el-bg-color);
      border: 1px solid var(--art-gray-200);
      border-radius: var(--el-border-radius-small);
      box-shadow: 0 6px 18px rgb(31 45 61 / 8%);
    }

    :deep(.vue-flow__controls-button) {
      color: var(--art-gray-700);
      background: var(--el-bg-color);
      border-bottom-color: var(--art-gray-200);

      &:hover,
      &:focus-visible {
        color: var(--theme-color);
        background: color-mix(in srgb, var(--theme-color) 8%, var(--el-bg-color));
      }
    }
  }

  @media (width <= 1100px) {
    .workflow-canvas-editor {
      &__toolbar {
        flex-direction: column;
      }

      &__toolbar-actions {
        flex-wrap: wrap;
      }

      &__workspace {
        grid-template-columns: minmax(0, 1fr);

        &.has-inspector {
          grid-template-columns: minmax(0, 1fr);
        }
      }

      &__inspector {
        min-height: 440px;
        border-top: 1px solid var(--art-gray-200);
        border-left: 0;
      }

      &__canvas {
        height: 440px;
      }
    }
  }

  :global(html[data-box-mode='border-mode'] .workflow-canvas-editor__node.is-selected) {
    box-shadow: inset 0 0 0 1px var(--theme-color);
  }

  :global(html[data-box-mode='shadow-mode'] .workflow-canvas-editor__node.is-selected) {
    border-color: transparent;
    box-shadow: var(--art-themed-action-active-shadow);
  }
</style>
