<template>
  <ArtPageShell>
    <div class="widget-page">
      <ArtSectionCard
        class="widget-section"
        title="资源选择器"
        subtitle="基于附件资源列表，支持单选、多选、分类筛选、搜索、分页、右键预览和确认回传。"
      >
        <template #actions>
          <ElTag effect="plain">ArtResourcePicker</ElTag>
        </template>

        <ElSpace wrap>
          <ElButton type="primary" @click="singleVisible = true">打开单选</ElButton>
          <ElButton @click="multipleVisible = true">打开多选</ElButton>
        </ElSpace>

        <ElDescriptions :column="2" border class="mt-4">
          <ElDescriptionsItem label="单选 v-model">
            <span class="widget-section__value">{{ singleValueText }}</span>
          </ElDescriptionsItem>
          <ElDescriptionsItem label="多选 v-model">
            <span class="widget-section__value">{{ multipleValueText }}</span>
          </ElDescriptionsItem>
        </ElDescriptions>

        <ArtTable :data="selectedRows" :columns="selectedColumns" :pagination="false" class="mt-4">
          <template #originName="{ row }">
            <ArtAttachmentLink
              :file="{
                name: row.originName,
                url: row.url,
                fileType: row.suffix
              }"
            />
          </template>
          <template #url="{ row }">
            <span class="widget-section__value">{{ row.url }}</span>
          </template>
        </ArtTable>
      </ArtSectionCard>

      <ArtSectionCard
        class="widget-section"
        title="API"
        subtitle="覆盖 ArtResourcePicker / ResourcePanel 的 props 和事件。"
      >
        <ElTabs>
          <ElTabPane label="Props">
            <ArtTable :data="propsRows" :columns="propsColumns" :pagination="false" />
          </ElTabPane>
          <ElTabPane label="Events / Resource">
            <ArtTable :data="eventRows" :columns="eventColumns" :pagination="false" />
          </ElTabPane>
        </ElTabs>
      </ArtSectionCard>

      <ArtResourcePicker
        v-model:visible="singleVisible"
        v-model="singleValue"
        :multiple="false"
        default-file-type="image"
        @confirm="handleSingleConfirm"
        @cancel="handleCancel"
      />

      <ArtResourcePicker
        v-model:visible="multipleVisible"
        v-model="multipleValue"
        multiple
        :limit="5"
        :page-size="24"
        default-file-type=""
        @confirm="handleMultipleConfirm"
        @cancel="handleCancel"
      />
    </div>
  </ArtPageShell>
</template>

<script setup lang="ts">
  import { ElMessage } from 'element-plus'
  import type { ColumnOption } from '@/types'
  import ArtResourcePicker from '@/components/core/forms/art-resource-picker/index.vue'
  import ArtAttachmentLink from '@/components/core/media/art-file-viewer/attachment-link.vue'
  import type { Resource } from '@/components/core/forms/art-resource-picker/type'

  defineOptions({ name: 'ResourcePickerWidget' })

  interface ApiRow {
    name: string
    type?: string
    defaultValue?: string
    payload?: string
    desc: string
  }

  const singleVisible = ref(false)
  const multipleVisible = ref(false)
  const singleValue = ref<string>()
  const multipleValue = ref<string[]>([])
  const selectedRows = ref<Resource[]>([])
  const selectedColumns: ColumnOption<Resource>[] = [
    { prop: 'originName', label: '文件名', minWidth: 180, useSlot: true },
    { prop: 'mimeType', label: 'MIME', minWidth: 160 },
    { prop: 'sizeInfo', label: '大小', width: 100 },
    { prop: 'url', label: 'URL', minWidth: 260, useSlot: true }
  ]
  const propsColumns: ColumnOption<ApiRow>[] = [
    { prop: 'name', label: '名称', width: 180 },
    { prop: 'type', label: '类型', width: 220 },
    { prop: 'defaultValue', label: '默认值', width: 140 },
    { prop: 'desc', label: '说明', minWidth: 240 }
  ]
  const eventColumns: ColumnOption<ApiRow>[] = [
    { prop: 'name', label: '名称', width: 180 },
    { prop: 'payload', label: '参数', width: 240 },
    { prop: 'desc', label: '说明', minWidth: 240 }
  ]
  const singleValueText = computed(() => singleValue.value ?? '-')
  const multipleValueText = computed(() =>
    multipleValue.value.length ? multipleValue.value.join(', ') : '[]'
  )

  const handleSingleConfirm = (rows: Resource[]) => {
    selectedRows.value = rows
    ElMessage.success(`已选择 ${rows.length} 个资源`)
  }

  const handleMultipleConfirm = (rows: Resource[]) => {
    selectedRows.value = rows
    ElMessage.success(`已选择 ${rows.length} 个资源`)
  }

  const handleCancel = () => {
    ElMessage.info('已取消选择')
  }

  const propsRows: ApiRow[] = [
    {
      name: 'v-model:visible',
      type: 'boolean',
      defaultValue: 'false',
      desc: '控制资源选择器弹窗显示。'
    },
    {
      name: 'v-model',
      type: 'string | string[]',
      defaultValue: '-',
      desc: '绑定选中的资源 URL。multiple=true 时为数组。'
    },
    { name: 'multiple', type: 'boolean', defaultValue: 'false', desc: '是否多选。' },
    { name: 'limit', type: 'number', defaultValue: '-', desc: '多选上限。' },
    { name: 'pageSize', type: 'number', defaultValue: '30', desc: '每页资源数量。' },
    {
      name: 'showAction',
      type: 'boolean',
      defaultValue: 'true',
      desc: '是否显示底部取消/确认按钮。'
    },
    {
      name: 'dbClickConfirm',
      type: 'boolean',
      defaultValue: 'false',
      desc: '双击资源是否立即确认。'
    },
    {
      name: 'defaultFileType',
      type: 'string',
      defaultValue: "''",
      desc: '默认分类：image/video/audio/document 或空字符串。'
    },
    {
      name: 'fileTypes',
      type: 'FileType[]',
      defaultValue: '内置分类',
      desc: '自定义文件分类配置。'
    }
  ]

  const eventRows: ApiRow[] = [
    { name: 'confirm', payload: 'Resource[]', desc: '点击确认或双击确认时返回选中的资源对象。' },
    { name: 'cancel', payload: '-', desc: '点击取消时触发。' },
    { name: 'Resource.id', payload: 'number', desc: '资源主键。' },
    { name: 'Resource.originName', payload: 'string', desc: '原始文件名。' },
    { name: 'Resource.mimeType', payload: 'string', desc: '资源 MIME 类型。' },
    {
      name: 'Resource.url',
      payload: 'string',
      desc: '资源访问地址，也是当前组件默认 v-model 值。'
    },
    { name: 'Resource.sizeInfo', payload: 'string', desc: '格式化后的文件大小。' }
  ]
</script>

<style scoped lang="scss">
  .widget-page {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding-bottom: 16px;
  }

  .widget-section {
    :deep(.el-descriptions__content) {
      min-width: 0;
    }
  }

  .widget-section__value {
    display: block;
    max-width: 100%;
    line-height: 22px;
    overflow-wrap: anywhere;
    white-space: normal;
  }
</style>
