<template>
  <ArtDialog ref="dialogRef" :loading="loadState.loading" @close="invalidatePermissionLoad">
    <div class="role-permission-dialog">
      <section class="role-permission-dialog__context art-card-xs">
        <div class="role-permission-dialog__context-icon" aria-hidden="true">
          <ArtSvgIcon icon="ri:shield-user-line" />
        </div>
        <div class="role-permission-dialog__context-copy">
          <div>
            <strong :title="roleData?.roleName">{{ roleData?.roleName || '未选择角色' }}</strong>
            <span :title="roleData?.roleCode">{{ roleData?.roleCode }}</span>
          </div>
          <p>勾选该角色可访问的菜单与按钮权限，保存后对关联用户生效。</p>
        </div>
        <span class="role-permission-dialog__selection-count">
          <template v-if="loadState.ready"
            >已选 {{ selectedCount }} / {{ permissionCount }} 项</template
          >
          <template v-else>{{ loadState.error ? '权限未加载' : '正在加载权限…' }}</template>
        </span>
      </section>

      <div class="role-permission-dialog__toolbar">
        <ElInput
          v-model="permissionKeyword"
          placeholder="搜索菜单、按钮或权限标识"
          aria-label="搜索菜单、按钮或权限标识"
          :disabled="!canEditPermissions"
          clearable
          @input="handlePermissionFilter"
        >
          <template #prefix>
            <ArtSvgIcon icon="ri:search-line" />
          </template>
        </ElInput>
        <span v-if="permissionKeyword.trim()" role="status">找到 {{ matchedCount }} 个匹配项</span>
        <span v-else>搜索会自动展开匹配路径</span>
      </div>

      <div
        v-if="menuList.length"
        class="role-permission-dialog__tree-viewport"
        :aria-busy="loadState.loading"
        :inert="permissionSaving || loadState.loading"
      >
        <ElAutoResizer v-show="!hasNoSearchMatches">
          <template #default="{ height }">
            <ElTreeV2
              ref="treeRef"
              class="role-permission-dialog__tree"
              :data="menuList"
              :height="height"
              :item-size="TREE_ROW_HEIGHT"
              :default-expanded-keys="initialExpandedKeys"
              :filter-method="filterMenuNode"
              :props="treeProps"
              @node-expand="handleNodeExpand"
              @node-collapse="handleNodeCollapse"
            >
              <template #default="{ data }">
                <div
                  class="role-permission-dialog__node"
                  :title="
                    data.type === 'button'
                      ? `${data.displayLabel} · ${data.name}`
                      : data.displayLabel
                  "
                >
                  <ElCheckbox
                    :model-value="checkedKeySet.has(data.id)"
                    :indeterminate="halfCheckedKeySet.has(data.id)"
                    :disabled="!canEditPermissions"
                    :aria-label="`${data.displayLabel}权限`"
                    @click.stop
                    @change="handleTreeCheckChange(data, $event === true)"
                  />
                  <ArtSvgIcon
                    class="role-permission-dialog__node-icon"
                    :icon="getNodeIcon(data.type)"
                  />
                  <span>{{ data.displayLabel }}</span>
                  <ElTag v-if="data.type === 'button'" size="small" type="info" effect="plain">
                    按钮
                  </ElTag>
                  <span v-if="data.type === 'button'" class="role-permission-dialog__node-code">
                    {{ data.name }}
                  </span>
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
        <ArtAsyncState
          v-if="hasNoSearchMatches"
          empty
          empty-text="未找到匹配的菜单或按钮"
          empty-description="换个关键词或清空搜索，已勾选的权限不会改变。"
          :empty-image-size="72"
          :min-height="180"
        >
          <template #empty-action>
            <ElButton @click="clearPermissionFilter">清空搜索</ElButton>
          </template>
        </ArtAsyncState>
      </div>

      <ArtAsyncState
        v-else-if="!loadState.loading"
        class="role-permission-dialog__state"
        :error="loadState.error ? '菜单权限加载失败，未修改现有授权。请重新加载后再保存。' : null"
        :empty="!loadState.error"
        empty-text="暂无可配置的菜单权限"
        empty-description="当前没有可配置菜单，现有授权保持不变。"
        :empty-image-size="72"
        :min-height="240"
        @retry="loadPermission"
      />
    </div>

    <template #footer="{ loading, api }">
      <div class="role-permission-dialog__footer">
        <ArtTooltip
          content="开启本身不会改变当前选择；之后勾选或取消父菜单时，才会同步其下级权限"
          placement="top"
        >
          <ElCheckbox v-model="isCascadeCheck" :disabled="!canEditPermissions">
            父级联动下级
          </ElCheckbox>
        </ArtTooltip>
        <div class="role-permission-dialog__footer-actions">
          <ElButton
            :disabled="!canEditPermissions || !!permissionKeyword.trim()"
            @click="toggleExpandAll"
          >
            {{ isExpandAll ? '全部收起' : '全部展开' }}
          </ElButton>
          <ArtTooltip content="作用于全部权限，不受当前搜索条件影响" placement="top">
            <ElButton :disabled="!canEditPermissions" @click="toggleSelectAll">
              {{ isSelectAll ? '取消全选' : '全部选择' }}
            </ElButton>
          </ArtTooltip>
          <ElButton
            type="primary"
            :loading="loading"
            :disabled="!canEditPermissions"
            @click="api.handleConfirm"
          >
            保存权限
          </ElButton>
        </div>
      </div>
    </template>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import ArtAsyncState from '@/components/core/feedback/art-async-state/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import { ElTreeV2, type TreeV2Instance } from 'element-plus'
  import { ElAutoResizer } from 'element-plus/es/components/table-v2/index.mjs'
  import { formatMenuTitle } from '@/utils/router'
  import TreeUtils from '@utils/tree'
  import { omit, uniq } from 'lodash-es'
  import { useDebounceFn } from '@vueuse/core'
  import type { AppRouteRecord } from '@/types'
  import { fetchMenuCatalog, getCurrentRoleMenus, saveRoleMenuList } from '@/api/system-manage'

  type RoleListItem = Api.SystemManage.RoleListItem
  type TreeKey = string | number
  type PermissionTreeNode = Omit<AppRouteRecord, 'children' | 'id'> & {
    id: string
    children?: PermissionTreeNode[]
    displayLabel: string
    searchText: string
  }

  interface Emits {
    (e: 'success'): void
  }

  interface PermissionLoadState {
    loading: boolean
    error: boolean
    ready: boolean
  }

  const emit = defineEmits<Emits>()
  const dialogRef = ref<ArtDialogExpose<RoleListItem>>()
  const treeRef = ref<TreeV2Instance>()
  const roleData = shallowRef<RoleListItem>()
  const menuList = ref<PermissionTreeNode[]>([])
  const loadState = reactive<PermissionLoadState>({ loading: false, error: false, ready: false })
  const permissionSaving = ref(false)
  // A role may be reopened before its previous API calls settle. Only the latest
  // load may publish data, checked keys, readiness, or scroll position.
  let loadSequence = 0
  const isExpandAll = ref(false)
  const isSelectAll = ref(false)
  const isCascadeCheck = ref(false)
  const permissionKeyword = ref('')
  const selectedCount = ref(0)
  const checkedKeys = ref<string[]>([])
  const initialExpandedKeys = ref<TreeKey[]>([])
  const manualExpandedKeys = new Set<TreeKey>()
  const TREE_ROW_HEIGHT = 40

  const treeUtils = new TreeUtils({
    idKey: 'id',
    parentKey: 'parentId',
    childrenKey: 'children',
    deepClone: false
  })

  const treeProps = {
    children: 'children',
    label: 'displayLabel',
    value: 'id'
  }

  const flatMenuList = computed(() =>
    treeUtils.treeToList(menuList.value, {
      includeDepth: true,
      includeParentChain: true
    })
  )
  const getCheckedKeys = (): string[] => checkedKeys.value.slice()
  const checkedKeySet = computed(() => new Set(checkedKeys.value))
  const halfCheckedKeySet = computed(() => {
    const halfChecked = new Set<string>()
    const nodes = new Map(flatMenuList.value.map((item) => [item.id, item]))
    for (const key of checkedKeys.value) {
      let parentId = nodes.get(key)?.parentId
      while (parentId && nodes.has(parentId)) {
        if (!checkedKeySet.value.has(parentId)) halfChecked.add(parentId)
        parentId = nodes.get(parentId)?.parentId
      }
    }
    return halfChecked
  })

  const getNodeLabel = (data: AppRouteRecord): string =>
    formatMenuTitle(data.meta?.title ?? '') || data.name || '未命名权限'

  const getNodeIcon = (type?: string): string => {
    if (type === 'button') return 'ri:key-2-line'
    if (type === 'folder') return 'ri:folder-3-line'
    return 'ri:menu-line'
  }

  const toPermissionNode = (data: AppRouteRecord): PermissionTreeNode | null => {
    if (!data.id) return null
    const displayLabel = getNodeLabel(data)
    return {
      ...omit(data, ['children']),
      id: data.id,
      displayLabel,
      searchText: `${displayLabel} ${data.name} ${data.path ?? ''}`.toLowerCase()
    }
  }

  const getAllMenuKeys = (): string[] => flatMenuList.value.map((item) => item.id)

  const getExpandableMenuKeys = (): TreeKey[] =>
    uniq(
      flatMenuList.value
        .map((item) => item.parentId)
        .filter((parentId): parentId is string => typeof parentId === 'string')
    )

  const permissionCount = computed(() => getAllMenuKeys().length)
  const canEditPermissions = computed(
    () =>
      loadState.ready &&
      !loadState.loading &&
      !loadState.error &&
      !permissionSaving.value &&
      permissionCount.value > 0
  )
  const matchedCount = computed(() => {
    const keyword = permissionKeyword.value.trim().toLowerCase()
    if (!keyword) return permissionCount.value
    return flatMenuList.value.filter((item) => item.searchText.includes(keyword)).length
  })
  const hasNoSearchMatches = computed(
    () => Boolean(permissionKeyword.value.trim()) && matchedCount.value === 0
  )

  const invalidatePermissionLoad = (): void => {
    loadSequence += 1
    loadState.ready = false
  }
  onBeforeUnmount(invalidatePermissionLoad)

  const resetPermission = (): void => {
    invalidatePermissionLoad()
    Object.assign(loadState, { loading: false, error: false, ready: false })
    checkedKeys.value = []
    roleData.value = undefined
    menuList.value = []
    isExpandAll.value = false
    isSelectAll.value = false
    isCascadeCheck.value = false
    permissionKeyword.value = ''
    selectedCount.value = 0
    initialExpandedKeys.value = []
    manualExpandedKeys.clear()
  }

  const loadPermission = async (): Promise<void> => {
    const roleId = roleData.value?.id
    if (!roleId || permissionSaving.value) return
    const sequence = ++loadSequence
    const isCurrentLoad = (): boolean => sequence === loadSequence && roleData.value?.id === roleId

    Object.assign(loadState, { loading: true, error: false, ready: false })
    try {
      const [menuResult, roleMenuResult] = await Promise.all([
        fetchMenuCatalog(),
        getCurrentRoleMenus({ id: roleId })
      ])
      if (!isCurrentLoad()) return
      if (menuResult.error || roleMenuResult.error) {
        loadState.error = true
        menuList.value = []
        return
      }

      const menus = menuResult.data ?? []
      const roleMenus = roleMenuResult.data ?? []
      const permissionNodes = (menus ?? [])
        .map(toPermissionNode)
        .filter((item): item is PermissionTreeNode => item !== null)
      menuList.value = treeUtils.listToTree(permissionNodes)
      initialExpandedKeys.value = menuList.value.map((item) => item.id)
      manualExpandedKeys.clear()
      initialExpandedKeys.value.forEach((key) => manualExpandedKeys.add(key))
      await nextTick()
      if (!isCurrentLoad()) return
      const availableIds = new Set(getAllMenuKeys())
      checkedKeys.value = roleMenus
        .map((item: { menuId: string }) => item.menuId)
        .filter((id) => availableIds.has(id))
      await nextTick()
      if (!isCurrentLoad()) return
      handleTreeCheck()
      loadState.ready = true
    } catch {
      if (isCurrentLoad()) {
        loadState.error = true
        menuList.value = []
      }
    } finally {
      if (isCurrentLoad()) {
        loadState.loading = false
        await nextTick()
        if (isCurrentLoad()) treeRef.value?.scrollTo(0)
      }
    }
  }

  const savePermission = async (): Promise<boolean> => {
    const roleId = roleData.value?.id
    if (!roleId || !canEditPermissions.value || !treeRef.value) return false
    const sequence = loadSequence
    permissionSaving.value = true

    try {
      const menuIds = getSelectedMenuIds()
      const { error } = await saveRoleMenuList({
        p_role_id: roleId,
        p_menu_ids: menuIds
      })
      if (error || sequence !== loadSequence) return false

      emit('success')
      return true
    } catch (error) {
      notifyFriendlyError(error, '角色权限保存失败，请刷新权限树后重试', 'warning')
      return false
    } finally {
      permissionSaving.value = false
    }
  }

  const toggleExpandAll = (): void => {
    const tree = treeRef.value
    if (!tree || !canEditPermissions.value || permissionKeyword.value.trim()) return

    const shouldExpand = !isExpandAll.value
    const expandedKeys = shouldExpand ? getExpandableMenuKeys() : []
    tree.setExpandedKeys(expandedKeys)
    manualExpandedKeys.clear()
    expandedKeys.forEach((key) => manualExpandedKeys.add(key))
    isExpandAll.value = shouldExpand
    tree.scrollTo(0)
  }

  const toggleSelectAll = async (): Promise<void> => {
    const tree = treeRef.value
    if (!tree || !canEditPermissions.value) return

    checkedKeys.value = isSelectAll.value ? [] : getAllMenuKeys()
    await nextTick()
    handleTreeCheck()
  }

  const handleTreeCheck = (): void => {
    const allKeys = getAllMenuKeys()
    isSelectAll.value = getCheckedKeys().length === allKeys.length && allKeys.length > 0
    selectedCount.value = getSelectedMenuIds().length
  }

  const handleTreeCheckChange = (data: PermissionTreeNode, checked: boolean): void => {
    const keys = isCascadeCheck.value
      ? treeUtils.getDescendants(menuList.value, data.id, true).map((item) => item.id)
      : [data.id]
    const next = new Set(checkedKeys.value)
    keys.forEach((key) => (checked ? next.add(key) : next.delete(key)))
    checkedKeys.value = [...next]
    handleTreeCheck()
  }

  const filterMenuNode = (value: string, data: Record<string, unknown>): boolean => {
    if (!value.trim()) return true
    const keyword = value.trim().toLowerCase()
    return typeof data.searchText === 'string' && data.searchText.includes(keyword)
  }

  const applyPermissionFilter = useDebounceFn((value: string, sequence: number): void => {
    const tree = treeRef.value
    if (!tree || sequence !== loadSequence || !canEditPermissions.value) return

    tree.filter(value)
    tree.scrollTo(0)
    if (!value.trim()) {
      tree.setExpandedKeys([...manualExpandedKeys])
    }
  }, 120)

  const handlePermissionFilter = (value: string): void => {
    void applyPermissionFilter(value, loadSequence)
  }

  const clearPermissionFilter = (): void => {
    permissionKeyword.value = ''
    handlePermissionFilter('')
  }

  const handleNodeExpand = (data: Record<string, unknown>): void => {
    if (permissionKeyword.value.trim()) return
    if (typeof data.id === 'string' || typeof data.id === 'number') {
      manualExpandedKeys.add(data.id)
    }
  }

  const handleNodeCollapse = (data: Record<string, unknown>): void => {
    if (permissionKeyword.value.trim()) return
    if (typeof data.id === 'string' || typeof data.id === 'number') {
      manualExpandedKeys.delete(data.id)
    }
    isExpandAll.value = false
  }

  const getSelectedMenuIds = (): string[] => getCheckedKeys()

  const handleOpen = async (data: RoleListItem): Promise<void> => {
    if (permissionSaving.value) return
    resetPermission()
    roleData.value = data
    await dialogRef.value?.handleOpen(data, {
      title: '配置菜单权限',
      subtitle: `为“${data.roleName}”配置可访问的菜单和操作权限`,
      size: 'lg',
      contentHeight: 'min(68vh, 640px)',
      dialogProps: {
        class: 'el-dialog-border',
        bodyClass: 'role-permission-dialog-shell'
      },
      onOpen: loadPermission,
      onConfirm: savePermission,
      onClose: () => !permissionSaving.value,
      onReset: resetPermission
    })
  }

  defineExpose({
    handleOpen,
    handleClose: () => dialogRef.value?.handleClose()
  })
</script>

<style scoped lang="scss">
  :global(.role-permission-dialog-shell) {
    overflow-x: hidden;
  }

  :global(.role-permission-dialog-shell .art-dialog__scrollbar),
  :global(.role-permission-dialog-shell .art-dialog__scrollbar > .el-scrollbar__wrap),
  :global(
    .role-permission-dialog-shell .art-dialog__scrollbar > .el-scrollbar__wrap > .el-scrollbar__view
  ),
  :global(.role-permission-dialog-shell .art-dialog__content) {
    height: 100%;
  }

  :global(.role-permission-dialog-shell .art-overlay-loading),
  :global(.role-permission-dialog-shell .art-overlay-loading__content) {
    height: 100%;
  }

  .role-permission-dialog {
    display: flex;
    flex-direction: column;
    min-width: 0;
    height: 100%;

    &__context {
      display: flex;
      gap: 10px;
      align-items: center;
      min-width: 0;
      padding: 12px 14px;
      margin-bottom: 12px;
    }

    &__context-icon {
      display: grid;
      flex: 0 0 38px;
      place-items: center;
      width: 38px;
      height: 38px;
      font-size: 18px;
      color: var(--el-color-primary);
      background: var(--el-color-primary-light-9);
      border: 1px solid var(--el-color-primary-light-7);
      border-radius: var(--art-control-radius);
    }

    &__context-copy {
      flex: 1;
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

        span {
          flex: 0 1 auto;
          min-width: 0;
          padding: 1px 7px;
          overflow: hidden;
          text-overflow: ellipsis;
          font-size: 11px;
          color: var(--el-text-color-secondary);
          white-space: nowrap;
          background: var(--el-fill-color-light);
          border-radius: 999px;
        }
      }

      p {
        margin: 3px 0 0;
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }
    }

    &__selection-count {
      flex: none;
      padding: 3px 9px;
      font-size: 12px;
      color: var(--el-color-primary);
      background: var(--el-color-primary-light-9);
      border-radius: 999px;
    }

    &__toolbar {
      display: flex;
      gap: 12px;
      align-items: center;
      justify-content: space-between;
      padding: 10px 12px;
      margin-bottom: 8px;
      background: var(--el-fill-color-extra-light);
      border-radius: var(--el-border-radius-base);

      .el-input {
        width: min(320px, 100%);
      }

      > span {
        font-size: 12px;
        color: var(--el-text-color-secondary);
        text-align: right;
      }
    }

    &__tree-viewport {
      flex: 1;
      width: 100%;
      min-height: 0;
      overflow: hidden;
    }

    &__state {
      flex: 1;
    }

    &__tree {
      width: 100%;
      padding: 2px 6px 0;

      :deep(.el-tree-node__content) {
        min-height: 40px;
        border-radius: var(--el-border-radius-base);
      }
    }

    &__node {
      display: flex;
      flex: 1;
      gap: 7px;
      align-items: center;
      min-width: 0;

      > span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      :deep(.el-tag) {
        flex: none;
      }
    }

    &__node-code {
      min-width: 0;
      max-width: 45%;
      margin-left: auto;
      font-size: 12px;
      color: var(--el-text-color-secondary);
    }

    &__node-icon {
      flex: 0 0 16px;
      font-size: 16px;
      color: var(--el-text-color-secondary);
    }

    &__footer {
      display: flex;
      gap: 12px;
      align-items: center;
      justify-content: space-between;
    }

    &__footer-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
    }

    @media (width <= 640px) {
      &__context {
        flex-wrap: wrap;
        align-items: flex-start;
      }

      &__context-copy {
        flex-basis: calc(100% - 48px);
      }

      &__selection-count {
        margin-left: 48px;
      }

      &__toolbar {
        flex-direction: column;
        align-items: stretch;

        .el-input {
          width: 100%;
        }

        > span {
          text-align: left;
        }
      }

      &__footer {
        flex-direction: column;
        align-items: stretch;
      }

      &__footer-actions {
        flex-wrap: wrap;
      }
    }
  }
</style>
