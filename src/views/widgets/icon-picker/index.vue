<template>
  <ArtPageShell>
    <div class="widget-page">
      <ArtSectionCard
        class="widget-section"
        title="图标选择器"
        subtitle="支持 Remix Icon 搜索、懒加载、缓存、手动输入、清空和命令式打开。"
      >
        <template #actions>
          <ElTag effect="plain">ArtIconPicker</ElTag>
        </template>

        <ElRow :gutter="16">
          <ElCol :xs="24" :md="12">
            <div class="demo-field">
              <span>基础选择</span>
              <ArtIconPicker v-model="iconValue" @select="handleSelect" @clear="handleClear" />
            </div>
          </ElCol>
          <ElCol :xs="24" :md="12">
            <div class="demo-field">
              <span>自定义配置</span>
              <ArtIconPicker
                ref="customPickerRef"
                v-model="customIconValue"
                title="选择菜单图标"
                placeholder="请输入或选择菜单图标"
                :page-size="80"
                :close-on-select="false"
              />
            </div>
          </ElCol>
        </ElRow>

        <ElSpace wrap>
          <ElButton type="primary" @click="openCustomPicker">handleOpen()</ElButton>
          <ElButton @click="reloadCustomPicker">reload()</ElButton>
          <ElButton @click="clearCustomPicker">handleClear()</ElButton>
        </ElSpace>

        <ElDescriptions :column="2" border class="mt-4">
          <ElDescriptionsItem label="基础值">{{ iconValue }}</ElDescriptionsItem>
          <ElDescriptionsItem label="自定义值">{{ customIconValue }}</ElDescriptionsItem>
        </ElDescriptions>
      </ArtSectionCard>

      <ArtSectionCard
        class="widget-section"
        title="API"
        subtitle="覆盖 ArtIconPicker 的 props、事件和 expose 方法。"
      >
        <ElTabs>
          <ElTabPane label="Props">
            <ArtTable :data="propsRows" :columns="propsColumns" :pagination="false" />
          </ElTabPane>
          <ElTabPane label="Events / Expose">
            <ArtTable :data="eventRows" :columns="eventColumns" :pagination="false" />
          </ElTabPane>
        </ElTabs>
      </ArtSectionCard>
    </div>
  </ArtPageShell>
</template>

<script setup lang="ts">
  import type { ColumnOption } from '@/types'
  import ArtIconPicker from '@/components/core/forms/art-icon-picker/index.vue'

  defineOptions({ name: 'IconPickerWidget' })

  interface ApiRow {
    name: string
    type?: string
    defaultValue?: string
    payload?: string
    desc: string
  }

  const iconValue = ref('ri:home-line')
  const customIconValue = ref('ri:settings-3-line')
  const customPickerRef = ref<InstanceType<typeof ArtIconPicker>>()

  const propsColumns: ColumnOption<ApiRow>[] = [
    { prop: 'name', label: '名称', width: 180 },
    { prop: 'type', label: '类型', width: 180 },
    { prop: 'defaultValue', label: '默认值', width: 240 },
    { prop: 'desc', label: '说明', minWidth: 240 }
  ]
  const eventColumns: ColumnOption<ApiRow>[] = [
    { prop: 'name', label: '名称', width: 180 },
    { prop: 'payload', label: '参数', width: 200 },
    { prop: 'desc', label: '说明', minWidth: 240 }
  ]

  const openCustomPicker = () => {
    void customPickerRef.value?.handleOpen()
  }

  const reloadCustomPicker = () => {
    void customPickerRef.value?.reload()
  }

  const clearCustomPicker = () => {
    customPickerRef.value?.handleClear()
  }

  const handleSelect = (value: string) => {
    ElMessage.success(`已选择：${value}`)
  }

  const handleClear = () => {
    ElMessage.info('已清空图标')
  }

  const propsRows: ApiRow[] = [
    {
      name: 'v-model',
      type: 'string',
      defaultValue: "''",
      desc: '图标值，推荐使用 ri:home-line 格式。'
    },
    { name: 'placeholder', type: 'string', defaultValue: '请选择图标', desc: '输入框占位文本。' },
    { name: 'title', type: 'string', defaultValue: '选择图标', desc: '弹窗标题。' },
    { name: 'prefix', type: 'string', defaultValue: 'ri', desc: 'Iconify 图标集合前缀。' },
    {
      name: 'collectionUrl',
      type: 'string',
      defaultValue: 'https://api.iconify.design/collection',
      desc: '图标集合接口地址。'
    },
    {
      name: 'pageSize',
      type: 'number',
      defaultValue: '140',
      desc: '每次渲染/滚动追加的图标数量。'
    },
    { name: 'clearable', type: 'boolean', defaultValue: 'true', desc: '输入框是否允许清空。' },
    { name: 'disabled', type: 'boolean', defaultValue: 'false', desc: '是否禁用组件。' },
    { name: 'readonly', type: 'boolean', defaultValue: 'false', desc: '是否禁止打开选择弹窗。' },
    {
      name: 'closeOnSelect',
      type: 'boolean',
      defaultValue: 'true',
      desc: '选择图标后是否自动关闭弹窗。'
    }
  ]

  const eventRows: ApiRow[] = [
    { name: 'change', payload: 'string', desc: '输入或选择图标值变化时触发。' },
    { name: 'select', payload: 'string', desc: '点击图标项时触发。' },
    { name: 'clear', payload: '-', desc: '清空时触发。' },
    { name: 'handleOpen()', payload: 'Promise<void>', desc: 'expose 方法，打开图标选择弹窗。' },
    { name: 'handleClear()', payload: 'void', desc: 'expose 方法，清空当前值。' },
    { name: 'reload()', payload: 'Promise<void>', desc: 'expose 方法，强制重新加载图标集合。' }
  ]
</script>

<style scoped lang="scss">
  .widget-page {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding-bottom: 16px;
  }

  .demo-field {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 16px;

    > span {
      font-size: 13px;
      font-weight: 500;
      color: var(--el-text-color-secondary);
    }
  }
</style>
