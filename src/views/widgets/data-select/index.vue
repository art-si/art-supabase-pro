<template>
  <ArtPageShell>
    <div class="widget-page">
      <ArtSectionCard
        class="widget-section"
        title="数据选择器"
        subtitle="复刻表格多选、表格单选、树形多选、树形单选四种常用弹窗选择场景。"
      >
        <template #actions>
          <ElTag effect="plain">Data Select Components</ElTag>
        </template>

        <ElRow :gutter="16">
          <ElCol :xs="24" :md="12">
            <div class="demo-field">
              <span>表格多选</span>
              <ArtTableMultipleSelect
                v-model="companyMultipleValue"
                v-model:selected-data="companyMultipleRows"
                title="选择合作企业"
                subtitle="可按企业名称、城市、行业或统一社会信用代码检索。"
                row-key="id"
                label-key="name"
                description-key="code"
                filter-key="industry"
                :columns="companyColumns"
                :api-fn="fetchCompanies"
                :filter-options="industryOptions"
                @confirm="handleConfirm"
                @clear="handleClear"
              />
            </div>
          </ElCol>

          <ElCol :xs="24" :md="12">
            <div class="demo-field">
              <span>表格单选</span>
              <ArtTableSingleSelect
                v-model="warehouseSingleValue"
                v-model:selected-data="warehouseSingleRows"
                title="选择发货仓"
                subtitle="单选模式确认后返回一条记录，可用于订单、调拨和库存业务。"
                row-key="id"
                label-key="name"
                description-key="city"
                :data="warehouseRows"
                :columns="warehouseColumns"
                :show-selected-panel="false"
                :show-pagination="false"
              />
            </div>
          </ElCol>

          <ElCol :xs="24" :md="12">
            <div class="demo-field">
              <span>树形多选</span>
              <ArtTreeMultipleSelect
                v-model="regionMultipleValue"
                v-model:selected-data="regionMultipleRows"
                title="选择经营区域"
                subtitle="支持父级和子级独立选择，已选项会在右侧聚合展示。"
                row-key="id"
                label-key="label"
                description-key="manager"
                children-key="children"
                :data="regionRows"
                :tree-check-strictly="true"
                :show-pagination="false"
              />
            </div>
          </ElCol>

          <ElCol :xs="24" :md="12">
            <div class="demo-field">
              <span>树形单选</span>
              <ArtTreeSingleSelect
                v-model="regionSingleValue"
                v-model:selected-data="regionSingleRows"
                title="选择默认区域"
                subtitle="单选模式下使用高亮当前节点，确认后返回一条层级记录。"
                row-key="id"
                label-key="label"
                description-key="manager"
                children-key="children"
                :data="regionRows"
                :show-selected-panel="false"
                :show-pagination="false"
              />
            </div>
          </ElCol>
        </ElRow>

        <ElDescriptions :column="2" border class="mt-4">
          <ElDescriptionsItem label="表格多选 v-model">
            {{ companyMultipleValue }}
          </ElDescriptionsItem>
          <ElDescriptionsItem label="表格单选 v-model">
            {{ warehouseSingleValue }}
          </ElDescriptionsItem>
          <ElDescriptionsItem label="树形多选 v-model">
            {{ regionMultipleValue }}
          </ElDescriptionsItem>
          <ElDescriptionsItem label="树形单选 v-model">
            {{ regionSingleValue }}
          </ElDescriptionsItem>
        </ElDescriptions>
      </ArtSectionCard>

      <ArtSectionCard
        class="widget-section"
        title="API"
        subtitle="四种组件共享 ArtDataSelect 的 props、事件、插槽和 expose 方法。"
      >
        <ElTabs>
          <ElTabPane label="Props">
            <ArtTable :data="propsRows" :columns="propsColumns" :pagination="false" />
          </ElTabPane>
          <ElTabPane label="Events / Slots / Expose">
            <ArtTable :data="eventRows" :columns="eventColumns" :pagination="false" />
          </ElTabPane>
        </ElTabs>
      </ArtSectionCard>
    </div>
  </ArtPageShell>
</template>

<script setup lang="ts">
  import type { ColumnOption } from '@/types'
  import type {
    DataSelectColumn,
    DataSelectFetchParams,
    DataSelectRecord
  } from '@/components/core/forms/art-data-select/types'
  import ArtTableMultipleSelect from '@/components/core/forms/art-data-select/table-multiple.vue'
  import ArtTableSingleSelect from '@/components/core/forms/art-data-select/table-single.vue'
  import ArtTreeMultipleSelect from '@/components/core/forms/art-data-select/tree-multiple.vue'
  import ArtTreeSingleSelect from '@/components/core/forms/art-data-select/tree-single.vue'

  defineOptions({ name: 'DataSelectWidget' })

  interface ApiRow {
    name: string
    type?: string
    defaultValue?: string
    payload?: string
    desc: string
  }

  const propsColumns: ColumnOption<ApiRow>[] = [
    { prop: 'name', label: '名称', width: 190 },
    { prop: 'type', label: '类型', width: 260 },
    { prop: 'defaultValue', label: '默认值', width: 150 },
    { prop: 'desc', label: '说明', minWidth: 240 }
  ]
  const eventColumns: ColumnOption<ApiRow>[] = [
    { prop: 'name', label: '名称', width: 190 },
    { prop: 'payload', label: '参数', width: 280 },
    { prop: 'desc', label: '说明', minWidth: 240 }
  ]

  const companyRows = ref<DataSelectRecord[]>([
    {
      id: 6910,
      name: '宁波澄澜数智园区服务有限公司',
      code: 'NB-P6910',
      industry: 'park',
      city: '宁波市',
      risk: '低'
    },
    {
      id: 7094,
      name: '洛阳砚川装备运维股份有限公司',
      code: 'LY-M56210',
      industry: 'maintenance',
      city: '洛阳市',
      risk: '中'
    },
    {
      id: 5691,
      name: '合肥青岚绿色材料科技有限公司',
      code: 'HF-G5691',
      industry: 'material',
      city: '合肥市',
      risk: '低'
    },
    {
      id: 9828,
      name: '泉州简仓即时零售集团',
      code: 'QZ-R39022',
      industry: 'retail',
      city: '泉州市',
      risk: '高'
    },
    {
      id: 8153,
      name: '无锡云拓智能供应链有限公司',
      code: 'WX-S8153',
      industry: 'supply',
      city: '无锡市',
      risk: '中'
    },
    {
      id: 7342,
      name: '晋江跨境集拼服务中心',
      code: 'JJ-C7342',
      industry: 'logistics',
      city: '晋江市',
      risk: '低'
    },
    {
      id: 7342,
      name: '晋江跨境集拼服务中心',
      code: 'JJ-C7342',
      industry: 'logistics',
      city: '晋江市',
      risk: '低'
    },
    {
      id: 7346,
      name: '晋江跨境集拼服务中心',
      code: 'JJ-C7342',
      industry: 'logistics',
      city: '晋江市',
      risk: '低'
    }
  ])

  const warehouseRows = ref<DataSelectRecord[]>([
    { id: 2001, name: '海曙云拣中心', city: '宁波市', capacity: '82%' },
    { id: 2002, name: '洛龙前置调拨仓', city: '洛阳市', capacity: '64%' },
    { id: 2003, name: '包河医药恒温仓', city: '合肥市', capacity: '71%' },
    { id: 2004, name: '晋江跨境集拼仓', city: '泉州市', capacity: '58%' },
    { id: 2100, name: '无锡云拣仓', city: '无锡市', capacity: '52%' }
  ])

  const regionRows = ref<DataSelectRecord[]>([
    {
      id: 'east',
      label: '东部协同区',
      manager: '负责人：宋承言',
      children: [
        { id: 'ningbo', label: '宁波湾组', manager: '负责人：谢闻舟' },
        { id: 'jiahe', label: '嘉禾组', manager: '负责人：许清和' },
        { id: 'taihu', label: '太湖组', manager: '负责人：陈景行' }
      ]
    },
    {
      id: 'central',
      label: '中原运营区',
      manager: '负责人：陆行知',
      children: [
        { id: 'luoyang', label: '洛阳组', manager: '负责人：许清和' },
        { id: 'zhengzhou', label: '郑州组', manager: '负责人：周明远' },
        { id: 'hefei', label: '合肥组', manager: '负责人：林知夏' }
      ]
    },
    {
      id: 'south',
      label: '南部增长区',
      manager: '负责人：顾云帆',
      children: [
        { id: 'quanzhou', label: '泉州组', manager: '负责人：叶澜' },
        { id: 'xiamen', label: '厦门组', manager: '负责人：苏禾' }
      ]
    }
  ])

  const industryOptions = [
    { label: '智慧园区', value: 'park' },
    { label: '装备运维', value: 'maintenance' },
    { label: '绿色材料', value: 'material' },
    { label: '即时零售', value: 'retail' },
    { label: '供应链', value: 'supply' },
    { label: '物流服务', value: 'logistics' }
  ]

  const companyColumns: DataSelectColumn[] = [
    { prop: 'id', label: 'ID', width: 90 },
    { prop: 'name', label: '企业名称', minWidth: 220 },
    {
      prop: 'industry',
      label: '行业',
      minWidth: 130,
      formatter: (row) => industryOptions.find((item) => item.value === row.industry)?.label ?? ''
    },
    { prop: 'city', label: '城市', width: 120 },
    {
      prop: 'risk',
      label: '风险',
      width: 90,
      align: 'center',
      tagType: (row) => {
        if (row.risk === '低') return 'success'
        if (row.risk === '中') return 'warning'
        return 'danger'
      }
    }
  ]

  const warehouseColumns: DataSelectColumn[] = [
    { prop: 'id', label: '编号', width: 110 },
    { prop: 'name', label: '仓库名称', minWidth: 220 },
    { prop: 'city', label: '城市', width: 140 },
    { prop: 'capacity', label: '库容', width: 120, align: 'right' }
  ]

  const companyMultipleValue = ref<Array<string | number>>([7094, 9828])
  const companyMultipleRows = ref<DataSelectRecord[]>([companyRows.value[1], companyRows.value[3]])
  const warehouseSingleValue = ref<string | number>(2003)
  const warehouseSingleRows = ref<DataSelectRecord[]>([warehouseRows.value[2]])
  const regionMultipleValue = ref<Array<string | number>>(['ningbo', 'taihu', 'luoyang'])
  const regionMultipleRows = ref<DataSelectRecord[]>([
    regionRows.value[0].children[0],
    regionRows.value[0].children[2],
    regionRows.value[1].children[0]
  ])
  const regionSingleValue = ref<string | number>('taihu')
  const regionSingleRows = ref<DataSelectRecord[]>([regionRows.value[0].children[2]])

  const fetchCompanies = async (params: DataSelectFetchParams) => {
    await new Promise((resolve) => setTimeout(resolve, 180))
    const keyword = params.keyword.trim().toLowerCase()
    const filterIndustry = params.filters.industry
    const rows = companyRows.value.filter((row) => {
      const matchesKeyword =
        !keyword ||
        String(row.name).toLowerCase().includes(keyword) ||
        String(row.city).toLowerCase().includes(keyword) ||
        String(row.industry).toLowerCase().includes(keyword) ||
        String(row.code).toLowerCase().includes(keyword)
      const matchesFilter = !filterIndustry || row.industry === filterIndustry
      return matchesKeyword && matchesFilter
    })
    const start = (params.page - 1) * params.pageSize
    return {
      data: rows.slice(start, start + params.pageSize),
      total: rows.length
    }
  }

  const handleConfirm = (value: unknown) => {
    ElMessage.success(`已确认：${JSON.stringify(value)}`)
  }

  const handleClear = () => {
    ElMessage.info('已清空选择')
  }

  const propsRows: ApiRow[] = [
    {
      name: 'modelValue',
      type: 'string | number | Array',
      defaultValue: '-',
      desc: '绑定选中的 key；multiple=true 时为数组。'
    },
    {
      name: 'selectedData',
      type: 'DataSelectRecord[]',
      defaultValue: '[]',
      desc: '绑定选中的完整行数据，用于回显名称和辅助信息。'
    },
    {
      name: '组件',
      type: 'ArtTableMultipleSelect / ArtTableSingleSelect / ArtTreeMultipleSelect / ArtTreeSingleSelect',
      defaultValue: '-',
      desc: '按表格/树形和单选/多选场景直接使用对应组件。'
    },
    { name: 'data', type: 'DataSelectRecord[]', defaultValue: '[]', desc: '本地静态数据源。' },
    {
      name: 'apiFn',
      type: '(params) => Promise',
      defaultValue: '-',
      desc: '异步数据源，接收 keyword、page、pageSize、filters。'
    },
    { name: 'columns', type: 'DataSelectColumn[]', defaultValue: '[]', desc: '表格列配置。' },
    { name: 'title / subtitle', type: 'string', defaultValue: '-', desc: '弹窗标题和副标题。' },
    {
      name: 'rowKey / labelKey',
      type: 'string | function',
      defaultValue: 'id / label',
      desc: '行唯一值和显示文本。'
    },
    {
      name: 'descriptionKey',
      type: 'string | function',
      defaultValue: '-',
      desc: '右侧已选面板和树节点的辅助描述。'
    },
    {
      name: 'disabledKey',
      type: 'string | function',
      defaultValue: 'disabled',
      desc: '控制行或节点是否可选。'
    },
    {
      name: 'filterKey / filterOptions',
      type: 'string / option[]',
      defaultValue: 'type / []',
      desc: '筛选字段和下拉选项。'
    },
    { name: 'childrenKey', type: 'string', defaultValue: 'children', desc: '树形子级字段名。' },
    {
      name: 'resultField / totalField',
      type: 'string',
      defaultValue: 'data / total',
      desc: '异步返回值的列表和总数字段路径。'
    },
    { name: 'dialogWidth', type: 'string | number', defaultValue: '1180px', desc: '弹窗宽度。' },
    { name: 'fullscreen', type: 'boolean', defaultValue: 'false', desc: '打开时是否默认全屏。' },
    {
      name: 'pageSize / pageSizes',
      type: 'number / number[]',
      defaultValue: '10 / [10,20,30,50]',
      desc: '分页大小配置。'
    },
    {
      name: 'showPagination',
      type: 'boolean',
      defaultValue: 'true',
      desc: '表格模式下是否显示分页。'
    },
    { name: 'showSearch', type: 'boolean', defaultValue: 'true', desc: '是否显示搜索区域。' },
    {
      name: 'showSelectedPanel',
      type: 'boolean',
      defaultValue: 'multiple',
      desc: '是否显示右侧已选面板。'
    },
    {
      name: 'clearable / disabled',
      type: 'boolean',
      defaultValue: 'true / false',
      desc: '触发器清空和禁用状态。'
    },
    {
      name: 'reserveSelected',
      type: 'boolean',
      defaultValue: 'true',
      desc: '表格分页时保留勾选。'
    },
    {
      name: 'treeCheckStrictly',
      type: 'boolean',
      defaultValue: 'true',
      desc: '树节点父子是否独立选择。'
    },
    {
      name: 'maxTagCount / emptyText',
      type: 'number / string',
      defaultValue: '2 / 暂无数据',
      desc: '触发器标签数量和空数据提示。'
    }
  ]

  const eventRows: ApiRow[] = [
    { name: 'update:modelValue', payload: 'DataSelectModelValue', desc: '选中值变化。' },
    { name: 'update:selectedData', payload: 'DataSelectRecord[]', desc: '选中行数据变化。' },
    { name: 'change', payload: 'value, rows', desc: '确认值变化时触发。' },
    { name: 'confirm', payload: 'value, rows', desc: '点击弹窗确定时触发。' },
    { name: 'clear / open / close', payload: '-', desc: '清空、打开、关闭事件。' },
    {
      name: 'trigger slot',
      payload: 'open, clear, selectedRows, selectedKeys',
      desc: '自定义触发器插槽。'
    },
    { name: 'open()', payload: 'Promise<void>', desc: 'expose 方法，打开弹窗。' },
    {
      name: 'close() / clear() / reload()',
      payload: '-',
      desc: 'expose 方法，关闭、清空、重新加载。'
    }
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
