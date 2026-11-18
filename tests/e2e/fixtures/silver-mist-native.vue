<template>
  <main class="native-audit">
    <header id="top">
      <div>
        <h1>银雾 · Element Plus 组件验收</h1>
        <p>工作台控件、数据表面、导航和反馈层</p>
      </div>
      <ElAnchor direction="horizontal">
        <ElAnchorLink href="#controls" title="输入与选择" />
        <ElAnchorLink href="#navigation" title="导航与状态" />
        <ElAnchorLink href="#feedback" title="反馈与浮层" />
      </ElAnchor>
    </header>

    <section id="controls" class="native-audit__grid" aria-label="输入与选择">
      <ElCard shadow="never">
        <template #header>录入与校验</template>
        <ElForm label-position="top">
          <ElFormItem label="名称" error="名称不能为空">
            <ElInput placeholder="填写库位名称" clearable />
          </ElFormItem>
          <ElFormItem label="联想">
            <ElAutocomplete
              v-model="autocomplete"
              placeholder="搜索设备"
              aria-label="搜索设备"
              :fetch-suggestions="suggest"
              clearable
            />
          </ElFormItem>
          <ElFormItem label="备注">
            <ElMention
              v-model="mention"
              :options="options"
              type="textarea"
              placeholder="输入 @ 选择成员"
              aria-label="提及成员"
            />
          </ElFormItem>
          <ElFormItem label="标签">
            <ElInputTag v-model="tags" placeholder="添加标签" />
          </ElFormItem>
          <ElFormItem label="分类标签" error="至少添加一个分类标签">
            <ElInputTag placeholder="添加分类标签" />
          </ElFormItem>
          <ElFormItem label="序号">
            <ElInputNumber v-model="quantity" controls-position="right" :min="1" :max="10" />
          </ElFormItem>
          <ElFormItem label="验证码">
            <ElInputOtp v-model="otp" :length="4" />
          </ElFormItem>
          <ElFormItem label="已锁定验证码">
            <ElInputOtp :model-value="otp" :length="4" type="filled" disabled />
          </ElFormItem>
          <ElFormItem label="不可编辑">
            <ElInput model-value="系统分配" disabled />
          </ElFormItem>
        </ElForm>
      </ElCard>

      <ElCard shadow="never">
        <template #header>单选、多选与虚拟列表</template>
        <ElForm label-position="top">
          <ElFormItem label="标准下拉">
            <ElSelect v-model="person" aria-label="标准下拉">
              <ElOptionGroup label="操作员">
                <ElOption v-for="o in options" :key="o.value" v-bind="o" />
              </ElOptionGroup>
            </ElSelect>
          </ElFormItem>
          <ElFormItem label="虚拟多选">
            <ElSelectV2
              v-model="people"
              :options="options"
              multiple
              filterable
              collapse-tags
              aria-label="虚拟多选"
            />
          </ElFormItem>
          <ElFormItem label="区位">
            <ElCascader v-model="region" :options="nodes" />
          </ElFormItem>
          <ElFormItem label="树形归属">
            <ElTreeSelect v-model="node" :data="nodes" node-key="value" check-strictly />
          </ElFormItem>
          <ElFormItem label="交互状态">
            <div class="native-audit__choices">
              <ElCheckboxGroup v-model="checked">
                <ElCheckbox value="手机" label="手机" />
                <ElCheckbox value="邮件" label="邮件" />
                <ElCheckbox value="短信" label="短信" disabled />
              </ElCheckboxGroup>
              <ElRadioGroup v-model="interval">
                <ElRadio value="工作日">工作日</ElRadio>
                <ElRadio value="每天">每天</ElRadio>
              </ElRadioGroup>
              <ElSpace wrap>
                <ElCheckboxGroup v-model="checked">
                  <ElCheckboxButton value="手机">手机</ElCheckboxButton>
                  <ElCheckboxButton value="邮件">邮件</ElCheckboxButton>
                </ElCheckboxGroup>
                <ElRadioGroup v-model="interval">
                  <ElRadioButton value="工作日">工作日</ElRadioButton>
                  <ElRadioButton value="每天">每天</ElRadioButton>
                </ElRadioGroup>
              </ElSpace>
            </div>
          </ElFormItem>
          <ElSpace wrap>
            <ElSwitch v-model="enabled" aria-label="开启提醒" />
            <ElSwitch :model-value="false" disabled aria-label="停用提醒" />
            <ElSegmented v-model="interval" :options="['工作日', '每天']" />
          </ElSpace>
          <ElSegmented
            class="native-disabled-segmented"
            model-value="预约"
            :options="[{ label: '预约', value: '预约', disabled: true }, '即时']"
            aria-label="预约方式"
          />
        </ElForm>
      </ElCard>

      <ElCard shadow="never">
        <template #header>数值、时间与颜色</template>
        <ElForm label-position="top">
          <ElFormItem label="使用率">
            <ElSlider v-model="capacity" :step="10" show-stops aria-label="使用率" />
          </ElFormItem>
          <ElFormItem label="巡检评分">
            <ElRate v-model="score" allow-half aria-label="巡检评分" />
          </ElFormItem>
          <ElFormItem label="颜色">
            <ElColorPicker v-model="color" show-alpha aria-label="标记颜色" />
          </ElFormItem>
          <ElFormItem label="日期">
            <ElDatePicker v-model="date" type="date" aria-label="巡检日期" />
          </ElFormItem>
          <ElFormItem label="开始时间">
            <ElTimePicker v-model="date" aria-label="开始时间" />
          </ElFormItem>
          <ElFormItem label="到场时间">
            <ElTimeSelect v-model="arrival" start="08:30" end="18:00" step="00:30" />
          </ElFormItem>
          <ElFormItem label="附件">
            <ElUpload drag :auto-upload="false" :limit="1">
              <span>点击或拖入文件</span>
              <template #tip>用于外观验收</template>
            </ElUpload>
          </ElFormItem>
        </ElForm>
      </ElCard>
      <ElCard shadow="never" class="native-audit__wide">
        <template #header>双栏穿梭与日期面板</template>
        <div class="native-audit__split">
          <ElTransfer
            v-model="transfer"
            :data="options.map((o) => ({ ...o, key: o.value }))"
            filterable
          />
          <ElDatePickerPanel v-model="date" type="date" />
        </div>
      </ElCard>
    </section>

    <section id="navigation" class="native-audit__grid" aria-label="导航与状态">
      <ElCard shadow="never">
        <template #header>导航与标签</template>
        <ElPageHeader title="返回" content="库存工作台">
          <template #breadcrumb>
            <ElBreadcrumb>
              <ElBreadcrumbItem :to="undefined">仓储</ElBreadcrumbItem>
              <ElBreadcrumbItem>盘点</ElBreadcrumbItem>
            </ElBreadcrumb>
          </template>
        </ElPageHeader>
        <ElMenu default-active="summary" mode="horizontal" :ellipsis="false">
          <ElMenuItem index="summary">概览</ElMenuItem>
          <ElSubMenu index="reports">
            <template #title>报表</template>
            <ElMenuItemGroup title="常用">
              <ElMenuItem index="daily">每日记录</ElMenuItem>
            </ElMenuItemGroup>
          </ElSubMenu>
          <ElMenuItem index="closed" disabled>已关闭</ElMenuItem>
        </ElMenu>
        <ElTabs type="border-card">
          <ElTabPane label="概览">汇总正常</ElTabPane>
          <ElTabPane label="记录">第一季度</ElTabPane>
        </ElTabs>
        <ElPagination
          :total="50"
          :page-size="10"
          :default-current-page="2"
          layout="prev,pager,next"
        />
      </ElCard>
      <ElCard shadow="never" id="progress-variants">
        <template #header>进度与语义状态</template>
        <ElSteps :active="1" finish-status="success">
          <ElStep title="收货" />
          <ElStep title="质检" />
          <ElStep title="归档" />
        </ElSteps>
        <ElDivider />
        <ElSpace wrap>
          <ElTag>跟踪</ElTag>
          <ElTag type="success">已完成</ElTag>
          <ElTag type="info">待查看</ElTag>
          <ElTag type="warning">需关注</ElTag>
          <ElTag type="danger">已阻止</ElTag>
          <ElCheckTag v-model:checked="enabled">仅看待处理</ElCheckTag>
          <ElCheckTag checked disabled>已锁定筛选</ElCheckTag>
        </ElSpace>
        <ElProgress aria-label="工作台处理进度" :percentage="capacity" />
        <ElProgress aria-label="工作台完成进度" :percentage="100" status="success" />
        <ElSpace wrap>
          <ElProgress aria-label="库容使用进度" :percentage="68" type="circle" :width="70" />
          <ElProgress aria-label="批次处理进度" :percentage="55" type="dashboard" :width="70" />
          <ElProgress
            aria-label="对账完成进度"
            :percentage="100"
            type="circle"
            status="success"
            :width="70"
          />
          <ElProgress
            aria-label="分拣任务进度"
            :percentage="73"
            type="circle"
            color="#8058ca"
            :width="70"
          />
        </ElSpace>
        <ElStatistic title="已处理" :value="128" />
        <ElCountdown title="剩余时间" :value="deadline" />
      </ElCard>
      <ElCard shadow="never">
        <template #header>层级、折叠与媒体</template>
        <ElTree
          :data="nodes"
          node-key="value"
          highlight-current
          current-node-key="a"
          default-expand-all
        />
        <div class="native-audit__tree">
          <ElAutoResizer>
            <template #default="{ height }">
              <ElTreeV2
                :data="nodes"
                :props="{ value: 'value', label: 'label' }"
                :height="height"
                :default-expanded-keys="['incoming']"
                show-checkbox
              />
            </template>
          </ElAutoResizer>
        </div>
        <ElCollapse v-model="expanded">
          <ElCollapseItem name="summary" title="附加说明">同步频率：每天</ElCollapseItem>
        </ElCollapse>
        <ElAvatarGroup>
          <ElAvatar>林</ElAvatar><ElAvatar>陈</ElAvatar><ElAvatar>周</ElAvatar>
        </ElAvatarGroup>
        <ElBadge type="primary" :value="3"><ElButton>待办</ElButton></ElBadge>
        <ElCarousel height="92px" :autoplay="false" indicator-position="outside" arrow="always">
          <ElCarouselItem>库位概览</ElCarouselItem>
          <ElCarouselItem>设备分布</ElCarouselItem>
        </ElCarousel>
      </ElCard>
      <ElCard shadow="never">
        <template #header>字段与任务记录</template>
        <ElDescriptions :column="1" border>
          <ElDescriptionsItem label="批次">INV-001</ElDescriptionsItem>
          <ElDescriptionsItem label="归属">收货工作区</ElDescriptionsItem>
          <ElDescriptionsItem label="规模">3 个库位</ElDescriptionsItem>
        </ElDescriptions>
        <ElTimeline>
          <ElTimelineItem type="success" timestamp="09:00">接收批次</ElTimelineItem>
          <ElTimelineItem type="warning" timestamp="10:20">待复核</ElTimelineItem>
        </ElTimeline>
      </ElCard>
      <ElCard shadow="never" class="native-audit__span-two">
        <template #header>表格与日历</template>
        <ElTable :data="records" stripe highlight-current-row>
          <ElTableColumn prop="code" label="库位" />
          <ElTableColumn prop="name" label="库区" />
          <ElTableColumn prop="status" label="状态" />
        </ElTable>
        <div class="native-audit__table-v2">
          <ElAutoResizer>
            <template #default="{ height, width }">
              <ElTableV2 :data="records" :columns="tableColumns" :height="height" :width="width" />
            </template>
          </ElAutoResizer>
        </div>
        <ElCalendar v-model="date" />
      </ElCard>
    </section>

    <section id="feedback" class="native-audit__grid" aria-label="反馈与浮层">
      <ElCard shadow="never">
        <template #header>通知与确认</template>
        <ElSpace wrap>
          <ElButtonGroup>
            <ElButton type="primary" @click="dialog = true">打开对话框</ElButton>
            <ElButton @click="drawer = true">打开抽屉</ElButton>
          </ElButtonGroup>
          <ElDropdown trigger="click">
            <ElButton>菜单</ElButton>
            <template #dropdown>
              <ElDropdownMenu>
                <ElDropdownItem>查看详情</ElDropdownItem>
                <ElDropdownItem disabled>已归档</ElDropdownItem>
              </ElDropdownMenu>
            </template>
          </ElDropdown>
          <ElTooltip content="当前批次待复核">
            <ElButton>提示</ElButton>
          </ElTooltip>
          <ElPopover trigger="click" title="帮助" content="用于验证浮层文字和底色。">
            <template #reference><ElButton>帮助浮层</ElButton></template>
          </ElPopover>
          <ElPopover
            trigger="click"
            effect="dark"
            title="仓库权限帮助"
            content="只有拥有排期权限的人员可以编辑该批次。"
          >
            <template #reference><ElButton>仓库权限</ElButton></template>
          </ElPopover>
          <ElPopconfirm title="是否清空筛选？">
            <template #reference><ElButton>轻量确认</ElButton></template>
          </ElPopconfirm>
          <ElButton @click="showNotice">消息与通知</ElButton>
          <ElButton id="tour-trigger" @click="tour = true">打开引导</ElButton>
        </ElSpace>
        <ElAlert title="状态已同步" type="success" show-icon :closable="false" />
        <ElAlert title="有 2 条记录待复核" type="warning" show-icon :closable="false" />
        <ElAlert title="当前筛选无法保存" type="error" show-icon :closable="false" />
        <ElLink href="#top" type="primary">返回组件顶部</ElLink>
        <ElText type="info">状态文字</ElText>
      </ElCard>
      <ElCard shadow="never">
        <template #header>空态、加载与结果</template>
        <ElEmpty description="暂无匹配记录" :image-size="75" />
        <ElSkeleton>
          <template #template>
            <ElSkeletonItem variant="p" />
            <ElSkeletonItem variant="text" style="width: 66%" />
          </template>
        </ElSkeleton>
        <div v-loading="true" class="native-audit__loading" element-loading-text="正在加载">
          同步工作区
        </div>
        <ElResult icon="success" title="保存完成" sub-title="数据可以继续核对" />
      </ElCard>
      <ElCard shadow="never">
        <template #header>布局与媒体边界</template>
        <ElContainer>
          <ElHeader height="auto"
            ><ElAffix :offset="12" target="#feedback">区域概览</ElAffix></ElHeader
          >
          <ElContainer>
            <ElAside width="34%">分组导航</ElAside>
            <ElMain>
              <ElRow :gutter="8">
                <ElCol :span="12">左区</ElCol><ElCol :span="12">右区</ElCol>
              </ElRow>
            </ElMain>
          </ElContainer>
          <ElFooter height="auto">区域摘要</ElFooter>
        </ElContainer>
        <ElSplitter class="native-audit__splitter">
          <ElSplitterPanel :min="40">可拖动左侧</ElSplitterPanel>
          <ElSplitterPanel :min="40">可拖动右侧</ElSplitterPanel>
        </ElSplitter>
        <ElScrollbar height="76px">
          <p v-for="r in records" :key="r.id">{{ r.code }} · {{ r.name }}</p>
        </ElScrollbar>
        <ElWatermark content="验收">
          <ElImage :src="image" :preview-src-list="[image]" preview-teleported alt="库区示意" />
        </ElWatermark>
      </ElCard>
    </section>

    <ElDialog
      v-model="dialog"
      title="核对批次"
      :draggable="draggableDialog"
      append-to-body
      width="min(440px, 94vw)"
    >
      <p>请核对当前选中记录。</p>
      <template #footer>
        <ElButton @click="dialog = false">关闭</ElButton>
        <ElButton type="primary" @click="dialog = false">完成</ElButton>
      </template>
    </ElDialog>
    <ElDrawer v-model="drawer" title="查看记录" append-to-body size="min(420px, 95vw)">
      <ElDescriptions :column="1" border>
        <ElDescriptionsItem label="编号">INV-001</ElDescriptionsItem>
      </ElDescriptions>
    </ElDrawer>
    <ElTour v-model="tour">
      <ElTourStep target="#tour-trigger" title="工作台引导" description="请核对筛选条件。" />
    </ElTour>
    <ElBacktop :visibility-height="300" />
  </main>
</template>

<script setup lang="ts">
  import { ref } from 'vue'
  import { ElMessage, ElNotification } from 'element-plus'
  import { ElAutoResizer } from 'element-plus/es/components/table-v2/index.mjs'

  const draggableDialog = new URLSearchParams(location.search).has('draggable')

  const options = [
    { label: '陈师傅', value: 'chen' },
    { label: '林主管', value: 'lin' },
    { label: '周检验', value: 'zhou' },
    { label: '已停用', value: 'inactive', disabled: true }
  ]
  const nodes = [
    { label: '收货区', value: 'incoming', children: [{ label: '库位 A', value: 'a' }] },
    { label: '分拣区', value: 'sorting', children: [{ label: '库位 B', value: 'b' }] }
  ]
  const records = [
    { id: 1, code: 'A-01', name: '收货区', status: '已接收' },
    { id: 2, code: 'B-02', name: '分拣区', status: '待复核' },
    { id: 3, code: 'C-03', name: '复核区', status: '待分配' }
  ]
  const tableColumns = [
    { key: 'code', dataKey: 'code', title: '库位', width: 100 },
    { key: 'name', dataKey: 'name', title: '库区', width: 110 },
    { key: 'status', dataKey: 'status', title: '状态', width: 100 }
  ]
  const image =
    'data:image/svg+xml,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="80"><rect width="180" height="80" fill="#455b69"/><circle cx="130" cy="36" r="20" fill="#b3c6ca"/><path d="M0 80 52 23l54 57M75 80l39-39 45 39" fill="#7696a0"/></svg>'
    )
  const autocomplete = ref('')
  const mention = ref('')
  const tags = ref(['盘点', '仓库'])
  const quantity = ref(3)
  const otp = ref('1280')
  const person = ref('chen')
  const people = ref(['chen', 'lin'])
  const region = ref(['incoming', 'a'])
  const node = ref('a')
  const checked = ref(['手机'])
  const interval = ref('工作日')
  const enabled = ref(true)
  const capacity = ref(60)
  const score = ref(3.5)
  const color = ref('#60a5fa')
  const date = ref(new Date(2026, 10, 17, 9, 30))
  const arrival = ref('09:30')
  const transfer = ref(['lin'])
  const expanded = ref(['summary'])
  const deadline = Date.now() + 60 * 60 * 1000
  const dialog = ref(false)
  const drawer = ref(false)
  const tour = ref(false)

  function suggest(query: string, done: (items: { value: string }[]) => void) {
    done(
      ['手持扫描仪', '电子标牌', '称重终端']
        .filter((name) => name.includes(query))
        .map((value) => ({ value }))
    )
  }

  function showNotice() {
    ElMessage({ type: 'warning', message: '有 2 条记录待复核', duration: 0, showClose: true })
    ElNotification({ type: 'success', title: '同步完成', message: '库位清单已更新。', duration: 0 })
  }
</script>

<style scoped>
  .native-audit {
    display: grid;
    gap: var(--art-space-5);
    max-inline-size: 1500px;
    padding: var(--art-space-5);
    margin-inline: auto;
    color: var(--el-text-color-primary);
  }

  .native-audit header {
    display: flex;
    flex-wrap: wrap;
    gap: var(--art-space-4);
    align-items: center;
    justify-content: space-between;
  }

  .native-audit h1 {
    margin: 0;
    font-size: 24px;
    font-weight: 620;
  }

  .native-audit__grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--art-space-4);
    align-items: start;
  }

  .native-audit__grid :deep(.el-card__body) {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--art-space-4);
    align-content: start;
  }

  .native-audit__choices {
    display: grid;
    gap: var(--art-space-2);
  }

  .native-audit__grid :deep(.el-progress--circle) {
    justify-self: start;
  }

  .native-audit__wide {
    grid-column: 1 / -1;
  }

  .native-audit__span-two {
    grid-column: span 2;
  }

  .native-audit__split {
    display: flex;
    flex-wrap: wrap;
    gap: var(--art-space-4);
    align-items: flex-start;
    min-inline-size: 0;
  }

  .native-audit__tree,
  .native-audit__table-v2 {
    height: 140px;
  }

  .native-audit__loading,
  .native-audit__splitter {
    height: 72px;
  }

  .native-audit :deep(.el-carousel__item) {
    display: grid;
    place-items: center;
    background: var(--el-fill-color-light);
  }

  @media (width < 950px) {
    .native-audit__grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (width < 630px) {
    .native-audit__grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .native-audit__span-two {
      grid-column: auto;
    }
  }
</style>
