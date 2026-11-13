<template>
  <div class="notes-page business-workspace-page art-full-height">
    <BusinessWorkspaceHeader
      density="compact"
      eyebrow="PERSONAL JOURNAL OPERATIONS"
      title="时光笔记"
      description="管理已同步到 Supabase 的时间轴笔记，按正文和日期检索，并维护正文与标签。"
      icon="ri:book-marked-line"
      :tags="workspaceTags"
      :metrics="workspaceMetrics"
      refreshable
      refresh-label="刷新时光笔记"
      :refresh-loading="loading"
      @refresh="refreshPage"
    >
      <template #actions>
        <BusinessTableWorkspaceActions :table="tableQueryRef" />
      </template>
    </BusinessWorkspaceHeader>

    <ArtTableQuery
      ref="tableQueryRef"
      :aria-busy="deleteBusy"
      focusable
      v-model="table.searchQuery"
      :search-items="table.searchItems"
      :api-fn="fetchTableData"
      :columns-factory="columnsFactory"
      :header-actions="table.headerActions"
      header-actions-placement="workspace"
      :table-header-props="{ layout: 'refresh,size,fullscreen,columns,settings' }"
      :table-props="tableProps"
    />

    <ArtOverlayLoading
      v-if="deleteBusy"
      loading
      overlay
      text="正在检查并删除笔记…"
      description="请稍候，完成后会自动更新列表与统计"
    />
    <NoteDialog ref="dialogRef" @success="handleSaveSuccess" />
    <NoteDetailDrawer ref="detailDrawerRef" />
    <MasterDataDeleteGuard ref="deleteGuardRef" />
    <ElImageViewer
      v-if="imagePreviewUrls.length"
      :url-list="imagePreviewUrls"
      teleported
      hide-on-click-modal
      @close="imagePreviewUrls = []"
    />
  </div>
</template>

<script setup lang="tsx">
  import type { ComputedRef, UnwrapNestedRefs } from 'vue'
  import { ElImage, ElImageViewer, ElMessage, ElTag } from 'element-plus'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type {
    ArtTableQueryExpose,
    ArtTableQueryHeaderAction,
    ArtTableQueryTableProps
  } from '@/components/core/tables/art-table-query/index.vue'
  import type { ColumnOption, DialogType } from '@/types'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtOverlayLoading from '@/components/core/feedback/art-overlay-loading/index.vue'
  import BusinessWorkspaceHeader, {
    type BusinessWorkspaceMetric,
    type BusinessWorkspaceTag
  } from '@/components/business/business-workspace-header/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import MasterDataDeleteGuard from '@/components/business/master-data-delete-guard/index.vue'
  import { useRecordDeleteGuard } from '@/hooks/core/useRecordDeleteGuard'
  import { buildSupabasePageRange } from '@/utils/supabase/pagination'
  import { formatWithDayjs } from '@/utils/time'
  import { fetchNoteList, fetchNoteStats, deleteNote, deleteNotes } from '@/api/notes'
  import NoteDialog from './modules/note-dialog.vue'
  import NoteDetailDrawer from './modules/note-detail-drawer.vue'

  defineOptions({ name: 'Notes' })

  type NoteItem = Api.Notes.NoteItem
  type SearchParams = Api.Notes.NoteSearchParams
  type TableParams = SearchParams & Pick<Api.Common.PaginationParams, 'current' | 'size'>

  interface TableGroup {
    searchQuery: SearchParams
    searchItems: ComputedRef<SearchFormItem[]>
    headerActions: ComputedRef<ArtTableQueryHeaderAction[]>
  }

  interface DialogExpose {
    handleOpen: (row?: NoteItem) => Promise<void>
  }
  interface DetailDrawerExpose {
    handleOpen: (row: NoteItem) => Promise<void>
  }

  const { deleteGuardRef, deleteRecord, deleteRecords, deleteBusy } = useRecordDeleteGuard(
    'notes',
    '时光笔记'
  )
  const tableQueryRef = ref<ArtTableQueryExpose>()
  const dialogRef = ref<DialogExpose>()
  const detailDrawerRef = ref<DetailDrawerExpose>()
  const loading = ref(false)
  const imagePreviewUrls = ref<string[]>([])
  const stats = ref<Api.Notes.NoteStats>({
    total: 0,
    users: 0,
    recent: 0,
    withImages: 0
  })

  const table: UnwrapNestedRefs<TableGroup> = reactive<TableGroup>({
    searchQuery: { keyword: '', dateRange: null },
    searchItems: computed(() => [
      {
        key: 'keyword',
        label: '内容检索',
        type: 'input',
        props: { placeholder: '搜索笔记正文或 HTML' }
      },
      {
        key: 'dateRange',
        label: '记录日期',
        type: 'date',
        props: {
          type: 'daterange',
          valueFormat: 'YYYY-MM-DD',
          startPlaceholder: '开始日期',
          endPlaceholder: '结束日期'
        }
      }
    ]),
    headerActions: computed(() => [
      {
        type: 'add',
        label: '新增笔记',
        disabled: deleteBusy.value,
        permission: 'System:Notes:Add',
        onClick: () => void dialogRef.value?.handleOpen()
      },
      {
        type: 'delete',
        label: '批量删除',
        permission: 'System:Notes:Delete',
        confirm: false,
        disabled: deleteBusy.value,
        buttonProps: { loading: deleteBusy.value },
        onClick: ({ selectedRows }) => removeSelected(selectedRows as NoteItem[])
      }
    ])
  })

  const workspaceTags = computed<BusinessWorkspaceTag[]>(() => [
    { label: '平台超级管理员可见', type: 'warning', effect: 'plain' },
    { label: '与移动端实时互通', type: 'success', effect: 'plain' },
    { label: '富文本 / 标签 / 图片', type: 'info', effect: 'plain' }
  ])

  const workspaceMetrics = computed<BusinessWorkspaceMetric[]>(() => [
    {
      label: '笔记总量',
      value: stats.value.total,
      description: '已同步到远端 notes 表',
      icon: 'ri:book-2-line',
      tone: 'primary'
    },
    {
      label: '活跃用户',
      value: stats.value.users,
      description: '近期开通过时间轴的账号',
      icon: 'ri:user-heart-line',
      tone: 'info'
    },
    {
      label: '近 7 天新增',
      value: stats.value.recent,
      description: '按创建时间统计',
      icon: 'ri:calendar-check-line',
      tone: 'success'
    },
    {
      label: '含图片记录',
      value: stats.value.withImages,
      description: '图片仍由移动端私有桶托管',
      icon: 'ri:image-2-line',
      tone: 'warning'
    }
  ])

  const tableProps: ArtTableQueryTableProps = {
    rowKey: 'id',
    tableLayout: 'fixed',
    emptyHeight: '260px',
    emptyText: '当前范围暂无笔记',
    emptyDescription: '调整检索条件，或新增一条时间轴记录。',
    paginationOptions: { pageSizes: [10, 20, 50], hideOnSinglePage: false }
  }

  const authorLabel = (row: NoteItem): string =>
    row.author?.nickName || row.author?.userName || `移动端用户 · ${row.userId.slice(0, 8)}`

  const columnsFactory = (): ColumnOption<NoteItem>[] => [
    { type: 'selection', width: 50, fixed: 'left', reserveSelection: true },
    { type: 'globalIndex', label: '序号', width: 72 },
    {
      prop: 'contentText',
      label: '笔记内容',
      minWidth: 360,
      formatter: (row) => (
        <div class="grid min-w-0 gap-1.5 py-1">
          <div class="flex min-w-0 items-center gap-2">
            <ArtSvgIcon icon="ri:quill-pen-line" class="shrink-0 text-base text-theme" />
            <strong class="min-w-0 truncate font-semibold" title={row.contentText}>
              {row.contentText || '富文本笔记'}
            </strong>
          </div>
          <div class="flex min-w-0 flex-wrap gap-1.5">
            {row.tags.length ? (
              row.tags.map((tag) => (
                <ElTag key={tag} class="max-w-full" type="info" size="small" effect="light">
                  <span class="block truncate" title={tag}>
                    {tag}
                  </span>
                </ElTag>
              ))
            ) : (
              <span class="text-xs text-[var(--el-text-color-secondary)]">未设置标签</span>
            )}
          </div>
        </div>
      )
    },
    {
      prop: 'images',
      label: '图片',
      width: 120,
      formatter: (row) =>
        row.imageUrls.length ? (
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="h-12 w-12 shrink-0 overflow-hidden rounded-[var(--art-control-radius)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--theme-color)]"
              aria-label={`预览笔记的 ${row.imageUrls.length} 张图片`}
              title="预览笔记图片"
              onClick={(event) => {
                event.stopPropagation()
                imagePreviewUrls.value = row.imageUrls
              }}
            >
              <ElImage
                class="h-full w-full"
                src={row.imageUrls[0]}
                fit="cover"
                loading="lazy"
                {...{ alt: '笔记图片缩略图', width: 48, height: 48 }}
                v-slots={{
                  placeholder: () => <span class="text-xs">加载中</span>,
                  error: () => <span class="text-xs">加载失败</span>
                }}
              />
            </button>
            <span class="text-xs text-[var(--el-text-color-secondary)]">
              {row.images.length} 张
            </span>
          </div>
        ) : (
          <span class="text-xs text-[var(--el-text-color-secondary)]">
            {row.images.length ? '图片暂不可用' : '无图片'}
          </span>
        )
    },
    {
      prop: 'author',
      label: '归属用户',
      minWidth: 160,
      formatter: (row) => (
        <div class="grid min-w-0 gap-1">
          <strong class="block truncate font-semibold" title={authorLabel(row)}>
            {authorLabel(row)}
          </strong>
          <span class="block truncate text-xs text-[var(--el-text-color-secondary)]">
            {row.author?.tenantName || '未关联后台用户'}
          </span>
        </div>
      )
    },
    {
      prop: 'createdAt',
      label: '记录时间',
      width: 170,
      formatter: (row) => (
        <span class="text-[var(--el-text-color-secondary)] tabular-nums">
          {formatWithDayjs(row.createdAt) || '--'}
        </span>
      )
    },
    {
      prop: 'operation',
      label: '操作',
      width: 150,
      fixed: 'right',
      formatter: (row) => (
        <BusinessTableRowActions>
          <ArtButtonTable
            type="view"
            label="查看笔记详情"
            permission="System:Notes:View"
            onClick={() => void detailDrawerRef.value?.handleOpen(row)}
          />
          <ArtButtonTable
            type="edit"
            label="编辑笔记"
            permission="System:Notes:Edit"
            disabled={deleteBusy.value}
            onClick={() => void dialogRef.value?.handleOpen(row)}
          />
          <ArtButtonTable
            type="delete"
            label="删除笔记"
            permission="System:Notes:Delete"
            disabled={deleteBusy.value}
            onClick={() => void removeNote(row)}
          />
        </BusinessTableRowActions>
      )
    }
  ]

  const fetchTableData = async (params: TableParams) => {
    const { from, to } = buildSupabasePageRange({ current: params.current, size: params.size })
    return await fetchNoteList({ ...params, from, to })
  }

  async function removeNote(row: NoteItem): Promise<void> {
    await deleteRecord({
      resource: {
        id: row.id,
        label: `${authorLabel(row)} · ${row.contentText.slice(0, 24) || '富文本笔记'}`
      },
      permission: 'System:Notes:Delete',
      remove: () => deleteNote(row.id),
      successMessage: '笔记已删除',
      onDeleted: async () => {
        await Promise.all([tableQueryRef.value?.refreshRemove(), loadStats()])
      }
    })
  }

  async function removeSelected(rows: NoteItem[]): Promise<void> {
    let deletedCount = 0
    const resources = rows.map((row) => ({
      id: row.id,
      label: `${authorLabel(row)} · ${row.contentText.slice(0, 24) || '富文本笔记'}`
    }))
    await deleteRecords({
      resources,
      permission: 'System:Notes:Delete',
      remove: async () => {
        deletedCount = await deleteNotes(rows.map((row) => row.id))
      },
      onDeleted: async () => {
        ElMessage.success(`已删除 ${deletedCount} 条笔记`)
        await Promise.all([tableQueryRef.value?.refreshRemove(), loadStats()])
      },
      confirmMessage: `确认删除选中的 ${rows.length} 条时光笔记？此操作不可恢复。`
    })
  }

  function handleSaveSuccess(type: DialogType): void {
    void Promise.all([
      type === 'add' ? tableQueryRef.value?.refreshCreate() : tableQueryRef.value?.refreshUpdate(),
      loadStats()
    ])
  }
  async function loadStats(): Promise<void> {
    const result = await fetchNoteStats()
    stats.value = result.data
  }
  async function refreshPage(): Promise<void> {
    loading.value = true
    try {
      await Promise.all([tableQueryRef.value?.refreshData(), loadStats()])
    } finally {
      loading.value = false
    }
  }

  onMounted(() => {
    void loadStats()
  })
</script>

<style scoped lang="scss">
  .notes-page {
    position: relative;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .notes-page :deep(.art-table-query) {
    flex: 1;
    min-height: 0;
  }
</style>
