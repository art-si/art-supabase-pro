<template>
  <ElCard class="tree-card art-card-xs flex flex-col h-full mt-0" shadow="never">
    <template #header>
      <div class="dict-type-tree__header">
        <div class="dict-type-tree__titlebar">
          <div>
            <strong>字典目录</strong>
            <span v-if="tree.loading">正在加载目录…</span>
            <span v-else-if="tree.error">目录加载失败</span>
            <span v-else>{{ directoryCount }} 个目录 · {{ dictionaryCount }} 个类型</span>
          </div>
          <ArtTooltip content="新增根节点" placement="top">
            <ElButton
              type="primary"
              aria-label="新增根节点"
              :disabled="!canInteract"
              @click="handleAdd()"
            >
              <ArtSvgIcon icon="ri:add-fill" />
              <span>新增</span>
            </ElButton>
          </ArtTooltip>
        </div>
        <ElInput
          v-model="tree.keyword"
          placeholder="搜索目录名称或字典编码"
          aria-label="搜索目录名称或字典编码"
          :disabled="!canInteract"
          clearable
          @input="handleFilter"
        >
          <template #prefix>
            <ArtSvgIcon icon="ri:search-line" />
          </template>
        </ElInput>
      </div>
    </template>

    <div class="dict-type-tree__viewport" :aria-busy="tree.loading">
      <ArtOverlayLoading
        v-if="tree.loading"
        loading
        overlay
        size="compact"
        text="正在加载字典类型…"
        description=""
      />
      <ArtAsyncState
        v-if="tree.error"
        :error="tree.error"
        error-title="字典目录加载失败"
        @retry="handleGetDictTypeList"
      />
      <ElAutoResizer v-else-if="tree.data.length">
        <template #default="{ height }">
          <ElTreeV2
            ref="treeRef"
            class="dict-type-tree__virtual-tree"
            :data="tree.data"
            :height="height"
            :item-size="TREE_ROW_HEIGHT"
            :props="tree.props"
            :filter-method="filterNode"
            :default-expanded-keys="tree.expandedKeys"
            :inert="tree.loading"
            highlight-current
            @node-click="handleNodeClick"
            @node-expand="handleNodeExpand"
            @node-collapse="handleNodeCollapse"
          >
            <template #default="{ data }">
              <div
                class="dict-type-tree__node"
                :class="{
                  'is-multi-selected': isNodeSelected(data),
                  'is-selectable-leaf': isSelectableLeaf(data),
                  'is-dragging': isDraggingNode(data),
                  'is-drop-before': isDropTarget(data, 'before'),
                  'is-drop-inner': isDropTarget(data, 'inner'),
                  'is-drop-after': isDropTarget(data, 'after')
                }"
                :draggable="!tree.keyword.trim()"
                @dragstart.stop="handleNodeDragStart(data, $event)"
                @dragover.stop.prevent="handleNodeDragOver(data, $event)"
                @dragleave.stop="handleNodeDragLeave($event)"
                @drop.stop.prevent="handleNodeDrop(data, $event)"
                @dragend.stop="handleNodeDragEnd"
              >
                <div class="dict-type-tree__label">
                  <ArtSvgIcon
                    class="dict-type-tree__node-icon"
                    :icon="data.nodeType === 'directory' ? 'ri:folder-3-line' : 'ri:book-2-line'"
                  />
                  <span class="dict-type-tree__name">{{ data.name }}</span>
                  <code
                    v-if="data.nodeType === 'dictionary'"
                    class="dict-type-tree__code"
                    :title="data.code"
                  >
                    {{ data.code }}
                  </code>
                </div>

                <div class="dict-type-tree__actions" @click.stop>
                  <ArtTooltip
                    v-if="data.nodeType === 'directory'"
                    content="新增下级"
                    placement="top"
                  >
                    <ArtIconButton
                      size="small"
                      icon="ri:add-line"
                      :label="`在${data.name}下新增`"
                      @click="handleAdd(data)"
                    />
                  </ArtTooltip>
                  <ArtTooltip content="编辑" placement="top">
                    <ArtIconButton
                      size="small"
                      icon="ri:pencil-line"
                      :label="`编辑${data.name}`"
                      @click="handleEdit(data)"
                    />
                  </ArtTooltip>
                  <ArtTooltip content="删除" placement="top">
                    <ArtIconButton
                      size="small"
                      icon="ri:delete-bin-5-line"
                      tone="danger"
                      :label="`删除${data.name}`"
                      @click="handleDelete(data)"
                    />
                  </ArtTooltip>
                </div>
              </div>
            </template>
            <template #empty>
              <ArtEmptyState
                title="暂无可显示内容"
                description="请调整当前范围或稍后刷新。"
                size="compact"
                :visual-size="64"
              />
            </template>
          </ElTreeV2>
        </template>
      </ElAutoResizer>

      <ArtEmptyState
        v-else-if="!tree.loading"
        title="暂无字典目录"
        description="新建根节点后，可继续添加目录或字典类型。"
        size="compact"
        :visual-size="76"
      >
        <ElButton type="primary" @click="handleAdd()">新增根节点</ElButton>
      </ArtEmptyState>
    </div>

    <div class="dict-type-tree__footer" role="note">
      <div class="dict-type-tree__footer-hint">
        <span class="dict-type-tree__footer-icon" aria-hidden="true">
          <ArtSvgIcon icon="ri:drag-move-2-line" />
        </span>
        <span class="dict-type-tree__footer-copy">
          <strong>{{ footerHint.title }}</strong>
          <small>{{ footerHint.description }}</small>
        </span>
      </div>
      <div class="dict-type-tree__footer-actions">
        <span
          v-if="tree.selectedKeys.length"
          class="dict-type-tree__footer-selection"
          aria-live="polite"
        >
          {{ tree.selectedKeys.length }} 项
        </span>
        <ElButton
          class="dict-type-tree__expand-toggle"
          size="small"
          text
          :disabled="!canInteract || !expandableNodeKeys.length"
          :aria-label="canExpandAll ? '全部展开字典目录' : '全部收起字典目录'"
          @click="toggleAllExpanded"
        >
          <ArtSvgIcon
            :icon="canExpandAll ? 'ri:expand-up-down-line' : 'ri:contract-up-down-line'"
          />
          {{ canExpandAll ? '全部展开' : '全部收起' }}
        </ElButton>
      </div>
    </div>
  </ElCard>

  <DictTypeDialog ref="dictTypeDialogRef" @success="handleSuccess" />
  <MasterDataDeleteGuard ref="deleteGuardRef" @cleared="handleSuccess" />
</template>

<script setup lang="ts">
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { ElMessage, ElTreeV2, type NodeDropType, type TreeV2Instance } from 'element-plus'
  import { ElAutoResizer } from 'element-plus/es/components/table-v2/index.mjs'
  import { cloneDeep, uniq } from 'lodash-es'
  import TreeUtils, { TreeDataError } from '@/utils/tree'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import ArtIconButton from '@/components/core/widget/art-icon-button/index.vue'
  import { deleteDictType, fetchDictionaryTypeList, saveDictTypeTreeOrder } from '@/api/data-center'
  import DictTypeDialog from './dict-type-dialog.vue'
  import MasterDataDeleteGuard, {
    type MasterDataDeleteGuardOpenOptions
  } from '@/components/business/master-data-delete-guard/index.vue'

  const { confirmAction } = useArtFeedback()

  const props = defineProps<{
    targetNodeId?: string
  }>()

  type DictTypeItem = Api.DataCenter.DictTypeItem
  type ActiveDropType = Exclude<NodeDropType, 'none'>

  interface DictTypeDialogExpose {
    handleOpen: (data?: DictTypeItem, options?: { parentId?: string }) => Promise<void>
  }

  interface MasterDataDeleteGuardExpose {
    inspect: (options: MasterDataDeleteGuardOpenOptions) => Promise<boolean>
  }

  interface TreeState {
    keyword: string
    loading: boolean
    error: string
    data: DictTypeItem[]
    expandedKeys: string[]
    hasInitializedExpandedKeys: boolean
    selectedKeys: string[]
    selectionAnchorKey?: string
    draggingBatchKeys: string[]
    dragSourceData: DictTypeItem[]
    dropTargetKey?: string
    dropType?: ActiveDropType
    props: {
      children: string
      label: string
      value: string
      class: (data: unknown) => Record<string, boolean>
    }
  }

  const deleteGuardRef = ref<MasterDataDeleteGuardExpose>()

  interface TreeOrderUpdate {
    id: string
    parentId: string | null
    sort: number
  }

  interface FlatDictTypeItem extends DictTypeItem {
    __parentChain?: Array<string | number>
  }

  interface DropSiblingContext {
    siblings: DictTypeItem[]
    targetIndex: number
    parentId: string | null
  }

  const emit = defineEmits<{
    'tree-node-click': [DictTypeItem]
  }>()

  const treeUtils = new TreeUtils({
    idKey: 'id',
    parentKey: 'parentId',
    childrenKey: 'children'
  })

  const treeRef = ref<TreeV2Instance>()
  let loadSequence = 0
  const dictTypeDialogRef = ref<DictTypeDialogExpose>()
  const TREE_ROW_HEIGHT = 40
  const tree = reactive<TreeState>({
    keyword: '',
    loading: false,
    error: '',
    data: [],
    expandedKeys: [],
    hasInitializedExpandedKeys: false,
    selectedKeys: [],
    selectionAnchorKey: undefined,
    draggingBatchKeys: [],
    dragSourceData: [],
    dropTargetKey: undefined,
    dropType: undefined,
    props: {
      children: 'children',
      label: 'name',
      value: 'id',
      class: getNodeClass
    }
  })

  const getNodeKey = (node?: Pick<DictTypeItem, 'id'> | null): string | undefined => {
    return node?.id ? String(node.id) : undefined
  }

  const canInteract = computed(() => !tree.loading && !tree.error)
  const footerHint = computed(() => {
    if (tree.error) return { title: '排序不可用', description: '目录加载成功后可调整顺序' }
    if (tree.loading) return { title: '正在加载目录', description: '加载完成后可继续操作' }
    if (!tree.data.length) return { title: '尚无目录', description: '新增目录后可调整层级与顺序' }
    return tree.keyword.trim()
      ? { title: '排序已暂停', description: '清空搜索后可继续拖拽' }
      : { title: '拖拽排序', description: '调整目录层级与节点顺序' }
  })
  const flatTree = computed(() => treeUtils.treeToList(tree.data))
  const directoryCount = computed(
    () => flatTree.value.filter((item) => item.nodeType === 'directory').length
  )
  const dictionaryCount = computed(
    () => flatTree.value.filter((item) => item.nodeType === 'dictionary').length
  )
  const getExpandableNodeKeys = (nodes: DictTypeItem[]): string[] => {
    const keys: string[] = []
    treeUtils.traverse(nodes, (node) => {
      const key = getNodeKey(node)
      if (key && node.children?.length) keys.push(key)
    })
    return keys
  }
  const expandableNodeKeys = computed(() => getExpandableNodeKeys(tree.data))
  const canExpandAll = computed(
    () =>
      !expandableNodeKeys.value.length ||
      expandableNodeKeys.value.some((key) => !tree.expandedKeys.includes(key))
  )

  const getCurrentDictType = computed<DictTypeItem | undefined>(() => {
    return (treeRef.value?.getCurrentNode() as DictTypeItem | null | undefined) ?? undefined
  })

  const filterNode = (value: string, rawData: unknown): boolean => {
    const data = rawData as DictTypeItem
    if (!value) return true
    const normalizedKeyword = value.trim().toLowerCase()
    return [data.name, data.code].some((field) =>
      String(field || '')
        .toLowerCase()
        .includes(normalizedKeyword)
    )
  }

  const handleFilter = (value: string): void => {
    treeRef.value?.filter(value)
    if (!value.trim()) {
      applyExpandedKeys()
    }
  }

  function getNodeClass(data: unknown): Record<string, boolean> {
    const node = getDictTypeData(data)

    return {
      'is-multi-selected': isNodeSelected(node),
      'is-selectable-leaf': isSelectableLeaf(node),
      'is-dragging': isDraggingNode(node),
      'is-drop-before': isDropTarget(node, 'before'),
      'is-drop-inner': isDropTarget(node, 'inner'),
      'is-drop-after': isDropTarget(node, 'after')
    }
  }

  const handleNodeClick = (rawData: unknown, _node: unknown, event: MouseEvent): void => {
    const data = getDictTypeData(rawData)
    if (!data) return

    if ((event.ctrlKey || event.metaKey || event.shiftKey) && isSelectableLeaf(data)) {
      handleShortcutSelection(data, event)
    } else if (!event.ctrlKey && !event.metaKey && !event.shiftKey) {
      clearSelectedKeys()
    }

    emit('tree-node-click', data)
  }

  function getDictTypeData(data: unknown): DictTypeItem | undefined {
    if (!data || typeof data !== 'object' || !('nodeType' in data)) return undefined
    return data as DictTypeItem
  }

  function isSelectableLeaf(node?: DictTypeItem | null): boolean {
    return node?.nodeType === 'dictionary' && !node.children?.length
  }

  function isNodeSelected(node?: DictTypeItem | null): boolean {
    const key = getNodeKey(node)
    return Boolean(key && tree.selectedKeys.includes(key))
  }

  function clearSelectedKeys(): void {
    tree.selectedKeys = []
    tree.selectionAnchorKey = undefined
  }

  const getFlatTreeNodes = (nodes: DictTypeItem[] = tree.data): FlatDictTypeItem[] => {
    return treeUtils.treeToList<FlatDictTypeItem>(nodes, {
      includeParentChain: true
    })
  }

  const getVisibleSelectableNodes = (): DictTypeItem[] => {
    const expandedKeySet = new Set(tree.expandedKeys)

    return getFlatTreeNodes()
      .filter((node) =>
        (node.__parentChain ?? []).every((parentKey) => expandedKeySet.has(String(parentKey)))
      )
      .filter(isSelectableLeaf)
  }

  const getOrderedSelectableKeys = (
    keys: string[],
    nodes: DictTypeItem[] = tree.data
  ): string[] => {
    const keySet = new Set(keys)

    return getFlatTreeNodes(nodes)
      .filter(isSelectableLeaf)
      .map(getNodeKey)
      .filter((key): key is string => Boolean(key && keySet.has(key)))
  }

  const replaceSelectedKeys = (keys: string[], anchorKey?: string): void => {
    tree.selectedKeys = uniq(keys)
    tree.selectionAnchorKey = anchorKey ?? tree.selectedKeys[tree.selectedKeys.length - 1]
  }

  const handleShortcutSelection = (data: DictTypeItem, event: MouseEvent): void => {
    event.preventDefault()
    const key = getNodeKey(data)
    if (!key) return

    if (event.shiftKey && tree.selectionAnchorKey) {
      const visibleNodes = getVisibleSelectableNodes()
      const visibleKeys = visibleNodes
        .map(getNodeKey)
        .filter((item): item is string => Boolean(item))
      const anchorIndex = visibleKeys.indexOf(tree.selectionAnchorKey)
      const currentIndex = visibleKeys.indexOf(key)

      if (anchorIndex === -1 || currentIndex === -1) {
        replaceSelectedKeys([key], key)
        return
      }

      const [start, end] =
        anchorIndex <= currentIndex ? [anchorIndex, currentIndex] : [currentIndex, anchorIndex]
      const rangeKeys = visibleKeys.slice(start, end + 1)
      replaceSelectedKeys(
        event.ctrlKey || event.metaKey ? [...tree.selectedKeys, ...rangeKeys] : rangeKeys
      )
      return
    }

    if (event.ctrlKey || event.metaKey) {
      replaceSelectedKeys(
        tree.selectedKeys.includes(key)
          ? tree.selectedKeys.filter((selectedKey) => selectedKey !== key)
          : [...tree.selectedKeys, key],
        key
      )
      return
    }

    replaceSelectedKeys([key], key)
  }

  const getTreeNodeKeys = (nodes: DictTypeItem[]): Set<string> => {
    return new Set(
      treeUtils
        .treeToList(nodes)
        .map(getNodeKey)
        .filter((key): key is string => Boolean(key))
    )
  }

  const syncExpandedKeysAfterDataLoad = (): void => {
    const availableKeys = getTreeNodeKeys(tree.data)

    if (!tree.hasInitializedExpandedKeys) {
      tree.expandedKeys = []
      tree.hasInitializedExpandedKeys = true
      return
    }

    tree.expandedKeys = tree.expandedKeys.filter((key) => availableKeys.has(key))
  }

  const syncSelectedKeysAfterDataLoad = (): void => {
    const availableKeys = getTreeNodeKeys(tree.data)
    tree.selectedKeys = tree.selectedKeys.filter((key) => availableKeys.has(key))

    if (tree.selectionAnchorKey && !availableKeys.has(tree.selectionAnchorKey)) {
      tree.selectionAnchorKey = tree.selectedKeys[tree.selectedKeys.length - 1]
    }
  }

  const applyExpandedKeys = (): void => {
    treeRef.value?.setExpandedKeys(tree.expandedKeys)
  }

  const setAllExpanded = (expanded: boolean): void => {
    tree.expandedKeys = expanded ? [...expandableNodeKeys.value] : []
    applyExpandedKeys()
  }

  const toggleAllExpanded = (): void => {
    setAllExpanded(canExpandAll.value)
  }

  const handleNodeExpand = (rawData: unknown): void => {
    const data = getDictTypeData(rawData)
    if (!data) return
    const key = getNodeKey(data)
    if (!key) return

    tree.expandedKeys = uniq([...tree.expandedKeys, key])
  }

  const handleNodeCollapse = (rawData: unknown): void => {
    const data = getDictTypeData(rawData)
    if (!data) return
    const key = getNodeKey(data)
    if (!key) return

    const descendantKeys = treeUtils
      .getDescendants(tree.data, key, true)
      .map(getNodeKey)
      .filter((itemKey): itemKey is string => Boolean(itemKey))

    const collapsedKeySet = new Set(descendantKeys)
    tree.expandedKeys = tree.expandedKeys.filter((itemKey) => !collapsedKeySet.has(itemKey))
  }

  const getBatchKeysForDragging = (data: DictTypeItem): string[] => {
    const key = getNodeKey(data)
    if (!key || !isSelectableLeaf(data) || !tree.selectedKeys.includes(key)) {
      return key ? [key] : []
    }

    return getOrderedSelectableKeys(tree.selectedKeys)
  }

  const getDropSiblingContext = (
    nodes: DictTypeItem[],
    targetNodeKey: string
  ): DropSiblingContext | undefined => {
    const flatTarget = getFlatTreeNodes(nodes).find((node) => getNodeKey(node) === targetNodeKey)
    if (!flatTarget) return undefined

    const parentId = flatTarget.__parentChain?.length
      ? String(flatTarget.__parentChain[flatTarget.__parentChain.length - 1])
      : null
    const siblings = parentId ? (treeUtils.findNode(nodes, parentId)?.children ?? []) : nodes
    const targetIndex = siblings.findIndex((node) => getNodeKey(node) === targetNodeKey)

    if (targetIndex === -1) return undefined

    return {
      siblings,
      targetIndex,
      parentId
    }
  }

  const getOrderedNodeKeys = (keys: string[], nodes: DictTypeItem[]): string[] => {
    const keySet = new Set(keys)

    return getFlatTreeNodes(nodes)
      .map(getNodeKey)
      .filter((key): key is string => Boolean(key && keySet.has(key)))
  }

  const removeTreeNodes = (
    sourceTree: DictTypeItem[],
    nodeKeys: string[]
  ): { nextTree: DictTypeItem[]; movedNodes: DictTypeItem[] } => {
    const orderedKeys = getOrderedNodeKeys(nodeKeys, sourceTree)
    let nextTree = cloneDeep(sourceTree)
    const movedNodes: DictTypeItem[] = []

    orderedKeys.forEach((key) => {
      const result = treeUtils.removeNode(nextTree, key)
      nextTree = result.tree

      if (result.removed) {
        movedNodes.push(result.removed)
      }
    })

    return {
      nextTree,
      movedNodes
    }
  }

  const moveTreeNodes = (
    sourceTree: DictTypeItem[],
    nodeKeys: string[],
    targetNodeKey: string,
    dropType: ActiveDropType
  ): DictTypeItem[] => {
    if (nodeKeys.includes(targetNodeKey)) return sourceTree

    const { nextTree, movedNodes } = removeTreeNodes(sourceTree, nodeKeys)
    if (!movedNodes.length) return sourceTree

    if (dropType === 'inner') {
      return moveTreeNodesToDirectory(nextTree, movedNodes, targetNodeKey) ?? sourceTree
    }

    const dropContext = getDropSiblingContext(nextTree, targetNodeKey)
    if (!dropContext) return sourceTree

    const insertIndex =
      dropType === 'before' ? dropContext.targetIndex : dropContext.targetIndex + 1
    movedNodes.forEach((node) => {
      Object.assign(node, {
        parentId: dropContext.parentId
      })
    })
    dropContext.siblings.splice(insertIndex, 0, ...movedNodes)

    return nextTree
  }

  const moveTreeNodesToDirectory = (
    nextTree: DictTypeItem[],
    movedNodes: DictTypeItem[],
    targetDirectoryId: string
  ): DictTypeItem[] | undefined => {
    const targetNode = treeUtils.findNode(nextTree, targetDirectoryId)
    if (!targetNode) return undefined

    targetNode.children = targetNode.children ?? []
    movedNodes.forEach((node) => {
      Object.assign(node, {
        parentId: targetDirectoryId
      })
      targetNode.children?.push(node)
    })

    return nextTree
  }

  const buildTreeOrderUpdates = (
    nodes: DictTypeItem[],
    parentId: string | null = null
  ): TreeOrderUpdate[] => {
    const updates: TreeOrderUpdate[] = []

    nodes.forEach((node, index) => {
      if (!node.id) return
      updates.push({
        id: node.id,
        parentId,
        sort: index + 1
      })
      updates.push(...buildTreeOrderUpdates(node.children ?? [], node.id))
    })

    return updates
  }

  const isDraggingNode = (node?: DictTypeItem | null): boolean => {
    const key = getNodeKey(node)
    return Boolean(key && tree.draggingBatchKeys.includes(key))
  }

  const isDropTarget = (node: DictTypeItem | undefined, dropType: ActiveDropType): boolean => {
    const key = getNodeKey(node)
    return Boolean(key && key === tree.dropTargetKey && dropType === tree.dropType)
  }

  const resetDropTarget = (): void => {
    tree.dropTargetKey = undefined
    tree.dropType = undefined
  }

  const resolveDropType = (data: DictTypeItem, event: DragEvent): ActiveDropType => {
    const target = event.currentTarget as HTMLElement
    const { top, height } = target.getBoundingClientRect()
    const pointerRatio = height > 0 ? (event.clientY - top) / height : 0.5

    if (data.nodeType === 'directory') {
      if (pointerRatio < 0.25) return 'before'
      if (pointerRatio > 0.75) return 'after'
      return 'inner'
    }

    return pointerRatio < 0.5 ? 'before' : 'after'
  }

  const isDropAllowed = (dropData: DictTypeItem, dropType: ActiveDropType): boolean => {
    const dropKey = getNodeKey(dropData)
    if (!dropKey || !tree.draggingBatchKeys.length || !tree.dragSourceData.length) return false
    if (dropType === 'inner' && dropData.nodeType !== 'directory') return false
    if (
      dropType !== 'inner' &&
      !dropData.parentId &&
      tree.draggingBatchKeys.some(
        (key) => treeUtils.findNode(tree.dragSourceData, key)?.nodeType === 'dictionary'
      )
    ) {
      return false
    }

    const blockedTargetKeys = new Set(
      tree.draggingBatchKeys.flatMap((draggingKey) =>
        treeUtils
          .getDescendants(tree.dragSourceData, draggingKey, true)
          .map(getNodeKey)
          .filter((key): key is string => Boolean(key))
      )
    )

    return !blockedTargetKeys.has(dropKey)
  }

  const handleNodeDragStart = (draggingData: DictTypeItem, event: DragEvent): void => {
    if (tree.keyword.trim()) {
      event.preventDefault()
      return
    }

    tree.dragSourceData = cloneDeep(tree.data)
    tree.draggingBatchKeys = getBatchKeysForDragging(draggingData)
    event.dataTransfer?.setData('text/plain', getNodeKey(draggingData) ?? '')
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
    }

    if (tree.draggingBatchKeys.length === 1) {
      if (isSelectableLeaf(draggingData)) {
        replaceSelectedKeys(tree.draggingBatchKeys, tree.draggingBatchKeys[0])
      } else {
        clearSelectedKeys()
      }
    }
  }

  const resetDragState = (): void => {
    tree.draggingBatchKeys = []
    tree.dragSourceData = []
    resetDropTarget()
  }

  const handleNodeDragEnd = (): void => {
    resetDragState()
  }

  const handleNodeDragOver = (dropData: DictTypeItem, event: DragEvent): void => {
    const dropType = resolveDropType(dropData, event)
    if (!isDropAllowed(dropData, dropType)) {
      resetDropTarget()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'none'
      return
    }

    tree.dropTargetKey = getNodeKey(dropData)
    tree.dropType = dropType
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  }

  const handleNodeDragLeave = (event: DragEvent): void => {
    const currentTarget = event.currentTarget as HTMLElement
    const relatedTarget = event.relatedTarget
    if (relatedTarget instanceof Node && currentTarget.contains(relatedTarget)) return
    resetDropTarget()
  }

  const handleNodeDrop = async (dropData: DictTypeItem, event: DragEvent): Promise<void> => {
    const currentKey = treeRef.value?.getCurrentKey()
    const batchKeys = [...tree.draggingBatchKeys]
    const dragSourceData = tree.dragSourceData
    const dropType = resolveDropType(dropData, event)
    const dropNodeKey = getNodeKey(dropData)

    if (!dropNodeKey || !isDropAllowed(dropData, dropType)) {
      resetDragState()
      return
    }

    try {
      tree.data = moveTreeNodes(dragSourceData, batchKeys, dropNodeKey, dropType)
      if (dropType === 'inner') {
        tree.expandedKeys = uniq([...tree.expandedKeys, dropNodeKey])
      }
      if (batchKeys.length > 1) {
        replaceSelectedKeys(batchKeys, batchKeys[0])
      }
      await nextTick()
      applyExpandedKeys()

      const updates = buildTreeOrderUpdates(tree.data)
      await saveDictTypeTreeOrder(updates)
      ElMessage.success(
        batchKeys.length > 1 ? `已移动 ${batchKeys.length} 个字典类型` : '目录位置和排序已保存'
      )
    } catch (error) {
      ElMessage.error(getFriendlySupabaseErrorMessage(error, '目录拖拽保存失败'))
    } finally {
      resetDragState()
      await handleGetDictTypeList()
      if (currentKey) {
        await nextTick()
        treeRef.value?.setCurrentKey(currentKey)
      }
    }
  }

  const handleAdd = (parent?: DictTypeItem): void => {
    if (!canInteract.value) return
    void dictTypeDialogRef.value?.handleOpen(undefined, {
      parentId: parent?.id
    })
  }

  const handleEdit = (data: DictTypeItem): void => {
    void dictTypeDialogRef.value?.handleOpen(data)
  }

  const handleDelete = async (row: DictTypeItem): Promise<void> => {
    if (!row.id) return

    try {
      const blocked = await deleteGuardRef.value?.inspect({
        resourceType: 'dict_type',
        resourceLabel: row.nodeType === 'directory' ? '字典目录' : '字典类型',
        resources: [{ id: row.id, label: row.name }]
      })
      if (blocked) return

      await confirmAction(
        row.nodeType === 'directory'
          ? '确定删除该目录吗？目录下存在子节点时不能删除。'
          : '确定删除该字典类型吗？存在字典项时不能删除。',
        '删除确认',
        {
          confirmButtonText: '删除',
          cancelButtonText: '取消',
          type: 'warning',
          confirmButtonType: 'danger'
        }
      )
      await deleteDictType(row)
      await handleGetDictTypeList()
    } catch {
      // 用户取消或数据库拒绝删除时保留当前树。
    }
  }

  const handleSuccess = async (): Promise<void> => {
    await handleGetDictTypeList()
  }

  const handleGetDictTypeList = async (): Promise<void> => {
    const sequence = ++loadSequence
    const currentKey = treeRef.value?.getCurrentKey()
    Object.assign(tree, { loading: true, error: '' })
    try {
      const { data = [], error } = await fetchDictionaryTypeList()
      if (sequence !== loadSequence) return
      if (error) throw error
      tree.data = treeUtils.listToTree(
        data as DictTypeItem[],
        (a, b) => Number(a.sort || 0) - Number(b.sort || 0)
      )
      syncExpandedKeysAfterDataLoad()
      syncSelectedKeysAfterDataLoad()
      await nextTick()
      if (sequence !== loadSequence) return
      applyExpandedKeys()
      if (currentKey) {
        treeRef.value?.setCurrentKey(currentKey)
      }
      focusTargetNode()
      if (tree.keyword.trim()) {
        treeRef.value?.filter(tree.keyword)
      }
    } catch (error) {
      if (sequence !== loadSequence) return
      tree.error =
        error instanceof TreeDataError
          ? '字典层级存在循环关联，请联系管理员修正上级关系后重新加载。'
          : getFriendlySupabaseErrorMessage(error, '字典目录暂时无法加载，请稍后重试。')
    } finally {
      if (sequence === loadSequence) tree.loading = false
    }
  }

  const focusTargetNode = (): void => {
    if (!props.targetNodeId) return
    const target = treeUtils.findNode(tree.data, props.targetNodeId) as DictTypeItem | undefined
    if (!target) return
    treeRef.value?.setCurrentKey(props.targetNodeId)
    emit('tree-node-click', target)
  }

  watch(
    () => props.targetNodeId,
    async () => {
      await nextTick()
      focusTargetNode()
    }
  )

  onMounted(() => {
    void handleGetDictTypeList()
  })

  onBeforeUnmount(() => {
    loadSequence++
  })

  defineExpose({
    dataState: {
      rows: computed(() => tree.data),
      loading: computed(() => tree.loading),
      error: computed(() => tree.error)
    },
    getCurrentDictType
  })
</script>

<style scoped lang="scss">
  .tree-card {
    :deep(.el-card__header) {
      padding: 14px 14px 12px;
      border-bottom: 1px solid var(--el-border-color-lighter);
    }

    :deep(.el-card__body) {
      display: flex;
      flex: 1;
      flex-direction: column;
      min-height: 0;
      padding: 8px 10px 0;
    }

    :deep(.el-scrollbar) {
      flex: 1;
      min-height: 0;
    }

    :deep(.el-tree-node__content) {
      border-radius: var(--el-border-radius-base);
    }

    :deep(.el-tree-node.is-drop-before > .el-tree-node__content) {
      box-shadow: inset 0 2px 0 var(--el-color-primary);
    }

    :deep(.el-tree-node.is-drop-after > .el-tree-node__content) {
      box-shadow: inset 0 -2px 0 var(--el-color-primary);
    }

    :deep(.el-tree-node.is-multi-selected > .el-tree-node__content) {
      color: var(--el-color-primary);
      background: var(--el-color-primary-light-9);
    }

    :deep(.el-tree-node.is-drop-inner > .el-tree-node__content) {
      color: var(--el-color-primary);
      background: var(--el-color-primary-light-8);
      box-shadow: inset 0 0 0 2px var(--el-color-primary);
    }

    :deep(.el-tree-node.is-drop-inner > .el-tree-node__content .dict-type-tree__node) {
      color: var(--el-color-primary);
      background: transparent;
    }
  }

  .dict-type-tree {
    &__viewport {
      position: relative;
      flex: 1;
      min-height: 0;
    }

    &__header {
      display: grid;
      gap: 12px;
    }

    &__titlebar {
      display: flex;
      gap: 12px;
      align-items: center;
      justify-content: space-between;

      > div {
        display: grid;
        gap: 2px;
        min-width: 0;

        strong {
          font-size: 15px;
          color: var(--el-text-color-primary);
        }

        span {
          font-size: 12px;
          color: var(--el-text-color-secondary);
        }
      }

      .el-button {
        flex: none;
      }
    }

    &__node {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      min-width: 0;
      height: 100%;
      padding-right: 6px;
      border-radius: var(--el-border-radius-base);

      &[draggable='true'] {
        cursor: grab;

        &:active {
          cursor: grabbing;
        }
      }

      &.is-multi-selected {
        color: var(--el-color-primary);
        background: var(--el-color-primary-light-9);
      }

      &.is-dragging {
        opacity: 0.55;
      }

      &.is-drop-before {
        box-shadow: inset 0 2px 0 var(--el-color-primary);
      }

      &.is-drop-after {
        box-shadow: inset 0 -2px 0 var(--el-color-primary);
      }

      &.is-drop-inner {
        color: var(--el-color-primary);
        background: var(--el-color-primary-light-8);
        box-shadow: inset 0 0 0 2px var(--el-color-primary);
      }

      &:hover,
      &:focus-within {
        .dict-type-tree__actions {
          display: flex;
        }
      }
    }

    &__label {
      display: flex;
      flex: 1 1 auto;
      gap: 6px;
      align-items: center;
      min-width: 0;
      overflow: hidden;

      .dict-type-tree__name {
        flex: 0 1 auto;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }

    &__code {
      flex: 0 1 auto;
      min-width: 0;
      max-width: 112px;
      padding: 2px 6px;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 10px;
      font-style: normal;
      line-height: 18px;
      color: var(--el-text-color-secondary);
      white-space: nowrap;
      background: var(--el-fill-color-light);
      border: 1px solid var(--el-border-color-lighter);
      border-radius: var(--el-border-radius-small);
    }

    &__node-icon {
      flex: 0 0 1em;
      width: 1em;
      height: 1em;
      font-size: 16px;
    }

    &__actions {
      display: none;
      flex: none;
      align-items: center;

      .el-button + .el-button {
        margin-left: 0;
      }
    }

    &__footer {
      display: flex;
      flex: none;
      gap: 10px;
      align-items: center;
      justify-content: space-between;
      min-height: 52px;
      padding: 8px 4px 8px 2px;
      color: var(--el-text-color-secondary);
      background: var(--el-bg-color);
      border-top: 1px solid var(--el-border-color-lighter);

      &-hint {
        display: flex;
        gap: 8px;
        align-items: center;
        min-width: 0;
      }

      &-icon {
        display: grid;
        flex: 0 0 28px;
        place-items: center;
        width: 28px;
        height: 28px;
        font-size: 14px;
        color: var(--el-color-primary);
        background: var(--el-color-primary-light-9);
        border: 1px solid var(--el-color-primary-light-8);
        border-radius: var(--el-border-radius-small);
      }

      &-copy {
        display: grid;
        gap: 1px;
        min-width: 0;
        line-height: 1.35;

        strong,
        small {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        strong {
          font-size: 12px;
          font-weight: 600;
          color: var(--el-text-color-regular);
        }

        small {
          font-size: 10px;
          color: var(--el-text-color-placeholder);
        }
      }

      &-selection {
        flex: none;
        padding: 2px 7px;
        font-size: 11px;
        line-height: 18px;
        color: var(--el-color-primary);
        background: var(--el-color-primary-light-9);
        border: 1px solid var(--el-color-primary-light-8);
        border-radius: 999px;
      }

      &-actions {
        display: flex;
        flex: none;
        gap: 4px;
        align-items: center;
      }
    }

    &__expand-toggle {
      flex: none;
      margin-left: 0;
    }
  }

  @media (hover: none) {
    .dict-type-tree__actions {
      display: flex;
    }
  }
</style>
