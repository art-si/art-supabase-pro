<template>
  <ArtSectionCard
    :show-scrollbar="loading || Boolean(error) || !groups.length"
    class="master-group-panel"
    :class="{ 'is-narrow': isNarrow, 'is-collapsed': collapsed, 'has-groups': groups.length }"
    :title="title"
    :subtitle="panelSubtitle"
    :loading="loading"
    :error="error"
    :empty="!loading && !error && !groups.length"
    :empty-visual-size="64"
    :min-height="140"
    empty-title="尚未建立分组"
    :empty-description="
      managePermission ? '可先建立顶级分组，再逐层补充分组结构。' : '请先在 MDM 主数据中维护分组。'
    "
    retryable
    body-class="master-group-panel__body"
    @retry="$emit('refresh')"
  >
    <template #actions>
      <div class="master-group-panel__actions">
        <ArtTreeExpandToggle
          v-if="showTreeToggle && !collapsed"
          :tree="treeRef"
          :data="treeData"
          label="分组树"
          :default-expanded="groups.length < 18"
        />
        <ArtIconButton
          v-if="managePermission"
          v-auth="managePermission"
          icon="ri:add-line"
          label="新增分组"
          @click="$emit('add')"
        />
        <ArtIconButton icon="ri:refresh-line" label="刷新分组" @click="$emit('refresh')" />
        <ArtIconButton
          v-if="isNarrow"
          :icon="collapsed ? 'ri:arrow-down-s-line' : 'ri:arrow-up-s-line'"
          :label="collapsed ? '展开分组' : '收起分组'"
          :aria-expanded="!collapsed"
          @click="expanded = !expanded"
        />
      </div>
    </template>

    <ElInput v-model="keyword" clearable placeholder="搜索分组名称或编码" aria-label="搜索分组">
      <template #prefix><ArtSvgIcon icon="ri:search-line" /></template>
    </ElInput>

    <button
      type="button"
      class="master-group-panel__all"
      :class="{ 'is-current': !selectedId }"
      :aria-pressed="!selectedId"
      @click="$emit('select', '')"
    >
      <span aria-hidden="true"><ArtSvgIcon icon="ri:apps-2-line" /></span>
      <span
        ><strong>全部分组</strong><small>{{ groups.length }} 个分组节点</small></span
      >
      <ArtSvgIcon v-if="!selectedId" icon="ri:check-line" aria-hidden="true" />
    </button>

    <ElScrollbar class="master-group-panel__scroll">
      <ElTree
        ref="treeRef"
        :data="treeData"
        node-key="id"
        :props="{ label: 'name', children: 'children' }"
        :current-node-key="selectedId || undefined"
        :filter-node-method="filterNode"
        :default-expand-all="groups.length < 18"
        highlight-current
        :expand-on-click-node="false"
        @node-click="$emit('select', $event.id)"
      >
        <template #default="{ data }">
          <div class="master-group-panel__node">
            <span aria-hidden="true"><ArtSvgIcon icon="ri:folder-3-line" /></span>
            <span
              ><strong :title="data.name">{{ data.name }}</strong
              ><small>{{ data.code }}</small></span
            >
            <span class="master-group-panel__node-actions" @click.stop>
              <ArtButtonMore
                v-if="managePermission"
                :list="groupActions"
                @click="handleGroupAction($event, data)"
              />
            </span>
          </div>
        </template>
        <template #empty>
          <ArtEmptyState
            title="未找到匹配项"
            description="请调整关键词或清空筛选条件。"
            size="compact"
            :visual-size="64"
          />
        </template>
      </ElTree>
    </ElScrollbar>
  </ArtSectionCard>
</template>

<script setup lang="ts">
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import type { ElTree } from 'element-plus'
  import { useMediaQuery } from '@vueuse/core'
  import TreeUtils from '@/utils/tree'
  import ArtIconButton from '@/components/core/widget/art-icon-button/index.vue'
  import ArtTreeExpandToggle from '@/components/core/widget/art-tree-expand-toggle/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtButtonMore, {
    type ButtonMoreItem
  } from '@/components/core/forms/art-button-more/index.vue'
  import type { MasterGroup } from '@/api/master-groups'

  const props = withDefaults(
    defineProps<{
      title: string
      groups: MasterGroup[]
      selectedId: string
      loading: boolean
      error: string
      managePermission?: string
      showTreeToggle?: boolean
    }>(),
    { showTreeToggle: true }
  )
  const emit = defineEmits<{
    select: [id: string]
    refresh: []
    add: [parent?: MasterGroup]
    edit: [row: MasterGroup]
    remove: [row: MasterGroup]
  }>()
  const groupActions = computed<ButtonMoreItem[]>(() => [
    { key: 'add', label: '新增下级分组', icon: 'ri:add-line', auth: props.managePermission },
    { key: 'edit', label: '编辑分组', icon: 'ri:edit-line', auth: props.managePermission },
    {
      key: 'delete',
      label: '删除分组',
      icon: 'ri:delete-bin-6-line',
      color: 'var(--el-color-danger)',
      auth: props.managePermission
    }
  ])
  const handleGroupAction = (item: ButtonMoreItem, group: MasterGroup): void => {
    if (item.key === 'add') emit('add', group)
    else if (item.key === 'edit') emit('edit', group)
    else if (item.key === 'delete') emit('remove', group)
  }

  const keyword = ref('')
  const isNarrow = useMediaQuery('(max-width: 900px)')
  const expanded = ref(false)
  const collapsed = computed(() => isNarrow.value && !expanded.value)
  const panelSubtitle = computed(() => {
    if (!isNarrow.value) return '选择分组后查看本级及下级数据'
    if (props.error) return '分组加载失败，请刷新重试'
    if (props.loading) return '正在加载分组…'
    const selected = props.groups.find((group) => group.id === props.selectedId)
    return `当前：${selected?.name || (props.selectedId ? '已选分组' : '全部分组')} · ${props.groups.length} 个节点`
  })
  const treeRef = ref<InstanceType<typeof ElTree>>()
  const treeUtils = new TreeUtils({ parentKey: 'parentId' })
  const treeData = computed(() => treeUtils.listToTree(props.groups))
  const filterNode = (value: string, data: Record<string, unknown>): boolean =>
    !value ||
    `${String(data.name ?? '')} ${String(data.code ?? '')}`
      .toLowerCase()
      .includes(value.toLowerCase())

  watch(keyword, (value) => treeRef.value?.filter(value))
  watch(
    () => props.selectedId,
    async (id) => {
      await nextTick()
      treeRef.value?.setCurrentKey(id || undefined)
      let parent = id ? treeRef.value?.getNode(id)?.parent : undefined
      while (parent) {
        parent.expanded = true
        parent = parent.parent
      }
    },
    { immediate: true }
  )
</script>

<style scoped lang="scss">
  .master-group-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;

    &.is-narrow {
      height: auto;

      &.has-groups:not(.is-collapsed) {
        height: min(440px, 70dvh);
      }

      :deep(.art-icon-button) {
        width: 44px;
        height: 44px;
      }

      .master-group-panel__node-actions {
        opacity: 1;
      }
    }

    &.is-collapsed {
      :deep(.art-section-card__header) {
        margin-bottom: 0;
      }

      :deep(.art-section-card__scrollbar),
      :deep(.master-group-panel__body) {
        display: none;
      }
    }

    :deep(.art-section-card__header) {
      display: grid;
      flex-wrap: nowrap;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
    }

    :deep(.art-section-card__identity) {
      min-width: 0;
    }

    :deep(.art-section-card__subtitle),
    :deep(.art-section-title) {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    :deep(.master-group-panel__body) {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: 12px;
      min-height: 0;
    }

    &__actions,
    &__node-actions {
      display: flex;
      gap: 2px;
    }

    &__all {
      @include master-group-all-button;

      > span:first-child {
        display: grid;
        place-items: center;
        width: 36px;
        height: 36px;
        color: var(--theme-color);
        background: var(--default-box-color);
        border-radius: var(--el-border-radius-base);
      }

      > span:nth-child(2) {
        display: grid;
        min-width: 0;
      }

      strong {
        color: var(--el-text-color-primary);
      }

      small {
        margin-top: 2px;
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }
    }

    &__scroll {
      flex: 1;
      min-height: 0;
    }

    &__node {
      display: grid;
      flex: 1;
      grid-template-columns: 20px minmax(0, 1fr) auto;
      gap: 7px;
      align-items: center;
      min-width: 0;

      > span:nth-child(2) {
        display: grid;
        min-width: 0;
      }

      strong,
      small {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      small {
        font-size: 10px;
        color: var(--el-text-color-secondary);
      }
    }

    &__node-actions {
      opacity: 0;
      transition: opacity var(--art-motion-duration-fast);
    }

    :deep(.el-tree-node__content) {
      min-height: 48px;
      margin-bottom: 2px;
      border-radius: var(--el-border-radius-base);

      &:hover .master-group-panel__node-actions,
      &:focus-within .master-group-panel__node-actions {
        opacity: 1;
      }
    }

    :deep(.el-tree-node.is-current > .el-tree-node__content) {
      background: color-mix(in srgb, var(--theme-color) 10%, var(--default-box-color));
      box-shadow: inset 3px 0 0 var(--theme-color);
    }
  }
</style>
