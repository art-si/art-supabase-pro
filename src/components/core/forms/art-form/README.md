# ArtForm

`ArtForm` 是基于 Element Plus `ElForm` 的元数据表单组件。它负责栅格布局、字段渲染、动态显隐、异步选项、重置/提交按钮、展开收起和提交输出清洗；底层未接管的 `ElForm` Props、属性和事件会透传到内部 `ElForm`。

## 基础用法

```vue
<template>
  <ArtForm
    ref="formRef"
    v-model="form"
    :items="formItems"
    :rules="rules"
    :span="12"
    validate-on-rule-change
    @submit="handleSubmit"
    @reset="handleReset"
    @validate="handleValidate"
  />
</template>

<script setup lang="ts">
  import ArtForm from '@/components/core/forms/art-form/index.vue'
  import type { FormItem } from '@/components/core/forms/art-form/index.vue'
  import type { FormRules } from 'element-plus'

  const form = ref({
    name: '',
    status: '1'
  })

  const formItems = computed<FormItem[]>(() => [
    {
      label: '基础信息',
      key: 'basicSection',
      type: 'divider',
      span: 24
    },
    {
      label: '名称',
      key: 'name',
      type: 'input',
      props: {
        clearable: true,
        placeholder: '请输入名称'
      }
    },
    {
      label: '状态',
      key: 'status',
      type: 'radioGroup',
      props: {
        options: [
          { label: '启用', value: '1' },
          { label: '禁用', value: '2' }
        ]
      }
    }
  ])

  const rules: FormRules = {
    name: [{ required: true, message: '请输入名称', trigger: 'blur' }]
  }
</script>
```

## Props

`ArtForm` 自有 Props：

| 属性 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `v-model` | `Record<string, any>` | `{}` | 表单数据；字段变化只更新当前路径，未变化的嵌套对象和数组保持引用稳定 |
| `items` | `FormItem[]` | `[]` | 表单项元数据 |
| `span` | `number` | `6` | 默认列宽，基于 24 栅格 |
| `gutter` | `number` | `12` | 栅格间距 |
| `labelPosition` | `'left' \| 'right' \| 'top'` | `'top'` | 标签位置；业务录入默认使用顶部标签 |
| `labelWidth` | `string \| number` | `'70px'` | 默认标签宽度，字段可用 `item.labelWidth` 覆盖 |
| `buttonLeftLimit` | `number` | `2` | 可见字段数量小于等于该值时，按钮组左对齐；设为 `0` 可始终右对齐 |
| `showReset` | `boolean` | `true` | 是否显示重置按钮 |
| `showSubmit` | `boolean` | `true` | 是否显示提交按钮 |
| `disabledSubmit` | `boolean` | `false` | 是否禁用提交按钮 |
| `rootClass` | `string` | `''` | 根节点附加 class |
| `formClass` | `string` | `''` | 内部 `ElForm` 附加 class，适用于自定义布局 |
| `customLayout` | `boolean` | `false` | 使用默认插槽接管复杂表单布局，仍复用 ArtForm 的校验和 Ref API |
| `resetText` | `string` | i18n 默认值 | 重置按钮文字 |
| `submitText` | `string` | i18n 默认值 | 提交按钮文字 |
| `enableExpand` | `boolean` | `false` | 是否启用展开/收起能力 |
| `isExpand` | `boolean` | `false` | 是否强制展开全部表单项 |
| `defaultExpanded` | `boolean` | `false` | 非强制展开时，初始是否展开 |
| `showExpand` | `boolean` | `true` | 是否显示展开/收起按钮；为 `false` 时显示全部字段，避免出现无法展开的筛选项 |
| `sanitizeOutput` | `Partial<SanitizeOutputOptions>` | `{}` | 提交输出清洗策略 |

## ElForm Props 透传

除 `model` 由 `v-model` 接管外，`ElForm` 的 Props 可直接写在 `ArtForm` 上，并会透传到内部 `ElForm`：

| ElForm 属性 | 类型/说明 |
| --- | --- |
| `rules` | 表单校验规则 |
| `label-position` | 标签位置；也可用 `ArtForm.labelPosition` |
| `require-asterisk-position` | 必填星号位置 |
| `label-width` | 标签宽度；也可用 `ArtForm.labelWidth` |
| `label-suffix` | 标签后缀 |
| `inline` | 行内表单 |
| `inline-message` | 行内显示校验信息 |
| `status-icon` | 显示校验状态图标 |
| `show-message` | 是否显示校验信息 |
| `validate-on-rule-change` | rules 变化后是否触发校验 |
| `hide-required-asterisk` | 隐藏必填星号 |
| `scroll-to-error` | 校验失败时滚动到错误项 |
| `scroll-into-view-options` | 滚动配置 |
| `size` | 表单尺寸 |
| `disabled` | 禁用整个表单；优先于字段的 `disabled: false`，同时禁用提交和重置操作 |

示例：

```vue
<ArtForm
  v-model="form"
  :items="items"
  :rules="rules"
  label-width="100px"
  status-icon
  scroll-to-error
  :validate-on-rule-change="false"
/>
```

## 表单布局规范

- 业务新增、编辑、审批和配置表单默认使用顶部标签，让标签、控件、说明和校验信息形成稳定的纵向阅读顺序。
- 两列短表单通常使用 `span="12"`，单列流程表单使用 `span="24"`；长文本、上传和分区标题应独占整行。
- 手机断点（小于 768px）统一使用单列满宽，避免两列输入框被压缩；平板和桌面保留配置的响应式列宽。
- 备注、说明、原因、意见等长文本使用 `type: 'textarea'`。该类型默认独占整行、初始 4 行高、限制 300 字并显示字数统计；业务上需要更长内容时只覆盖 `props.maxlength`，不要重复设置高度和统计开关。
- `ArtSearchBar` 保持紧凑的左右标签布局，适合高频筛选和表格查询，不受 `ArtForm` 顶部标签默认值影响。
- 只有空间高度明显受限的台账筛选、表格内编辑等高密度场景，才显式设置 `label-position="left"` 或 `label-position="right"`，并同时给出合适的 `label-width`。
- 在 `ArtDialog` 的专注填单模式中，普通字段标签保持单行，超出标签宽度时省略；悬停标签可查看完整文字，帮助图标仍独立显示。
- 不要用 placeholder 代替标签；帮助说明和校验信息继续显示在对应控件下方。

## Events

| 事件       | 参数                          | 说明                                   |
| ---------- | ----------------------------- | -------------------------------------- |
| `submit`   | `output: Record<string, any>` | 点击提交按钮触发，参数为清洗后的输出   |
| `reset`    | 无                            | 点击重置按钮触发；组件会先恢复初始快照 |
| `validate` | `prop, isValid, message`      | 透传 `ElForm` 的字段校验事件           |

## Slots

`ArtForm` 为每个 `FormItem.key` 自动开放同名插槽。

| 插槽                   | 参数                   | 说明                                       |
| ---------------------- | ---------------------- | ------------------------------------------ |
| `[item.key]`           | `{ item, modelValue }` | 完全自定义当前字段内容                     |
| `[divider.key]Actions` | `{ item, modelValue }` | 在分区标题右侧放置操作按钮；折叠时自动隐藏 |

```vue
<ArtForm v-model="form" :items="items">
  <template #avatar>
    <ArtUploadImage v-model="form.avatar" />
  </template>
</ArtForm>
```

## Ref API

### 预置控件的加载约定

- `customLayout` 表单不加载预置控件注册表；只有字段使用预置类型时才加载 `components.ts`。业务页面继续复用已有字段组件，无需自行维护控件映射。
- 加载期间保留字段容器和表单模型，显示共享加载状态；提交、重置和公开 `validate()` 会阻止操作。加载失败显示共享错误状态，重试保留已填值；持续失败时提示刷新，不反复提交无效重试。
- 普通表单的日期范围控件受字段可用宽度约束。窄屏验收应同时检查控件边界和页面横向溢出，不能仅依靠父容器裁切隐藏问题。

### 远程选项的状态约定

- `api` 返回的 `error`、抛出的异常以及 `beforeFetch` / `afterFetch` 异常均显示字段错误与重新加载入口，不视为业务空数据，也不自动选择部分结果。
- 远程选项加载或失败时，该字段不可选择；可见字段存在这些状态时，提交按钮及公开 `validate()` 均阻止提交。业务提交应调用组件公开的 `validate()`，不要通过底层 `ref` 绕过此检查。
- 校验保留 Element Plus 契约：传入回调时以 `false` 和字段错误调用回调并返回 `false`；不传回调时拒绝字段错误。只依赖 `await validate()` 抛错的既有提交方仍会被阻止。
- 重新加载保留表单模型。参数变化使旧请求和旧选项失效；`immediate: false` 字段需由调用方重新加载或使用字段重试入口。
- 同一字段只有最新请求可写入选项、自动选择或结束加载。组件卸载后返回的结果失效。
- 已有选中值不会因加载失败或成功而自动清除。切换业务归属时，调用方必须按业务规则清理不兼容引用；服务端继续校验引用所属租户与权限。

| 方法/属性 | 类型 | 说明 |
| --- | --- | --- |
| `ref` | `Ref<FormInstance \| undefined>` | 底层 `ElForm` 实例 |
| `validate(...args)` | `FormInstance['validate']` | 执行校验 |
| `validateField(...args)` | `FormInstance['validateField']` | 校验指定字段 |
| `clearValidate(...args)` | `FormInstance['clearValidate']` | 清除校验状态 |
| `scrollToField(...args)` | `FormInstance['scrollToField']` | 滚动定位到指定字段，适用于长表单或跨页签校验 |
| `reset()` | `() => void` | 执行组件重置逻辑并触发 `reset` |
| `fetchOptions(item)` | `(item: FormItem) => Promise<Record<string, any>[]>` | 加载单个字段的异步选项 |
| `reloadOptions(key?)` | `(key?: string) => Promise<unknown>` | 重新加载指定字段或全部异步选项 |
| `readyToSubmit` | `boolean` | 控件与远程选项就绪且表单未禁用、未提交；外部弹窗保存按钮可据此禁用，不代表必填校验已通过 |
| `getOutput()` | `() => Record<string, any>` | 获取按 `sanitizeOutput` 清洗后的表单输出 |

底层 `ElForm` 的其他方法可通过 `formRef.value?.ref.value` 访问，例如 `resetFields`、`fields`。

## FormItem

| 属性 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `key` | `string` | 必填 | 字段路径，支持 `a.b`、`a.0.b` |
| `label` | `string \| () => VNodeChild \| Component` | 必填 | 字段标签 |
| `description` | `string \| () => VNodeChild \| Component` | `undefined` | 字段下方说明 |
| `help` | `string \| () => VNodeChild \| Component` | `undefined` | 标签旁帮助提示 |
| `labelWidth` | `string \| number` | `undefined` | 当前字段标签宽度 |
| `type` | `FormItemType` | `'input'` | 内置组件类型 |
| `render` | `() => VNode \| Component` | `undefined` | 自定义渲染组件，优先级高于 `type` |
| `hidden` | `boolean \| Ref<boolean> \| (model, item) => boolean` | `false` | 是否隐藏字段 |
| `span` | `number` | 继承 `ArtForm.span` | 当前字段列宽 |
| `options` | `Record<string, any>[]` | `[]` | 静态选项 |
| `props` | `Record<string, any>` | `{}` | 透传给字段组件的 Props/事件 |
| `slots` | `Record<string, () => any>` | `{}` | 透传给字段组件的内部插槽 |
| `placeholder` | `string` | `undefined` | 兼容字段；推荐写在 `props.placeholder` |
| `api` | `(params) => MaybePromise<TResult>` | `undefined` | 异步获取选项 |
| `immediate` | `boolean` | `true` | 是否挂载后立即请求 `api` |
| `params` | `TParams` | `undefined` | 传给 `api` 的参数 |
| `beforeFetch` | `(params) => MaybePromise<TParams>` | `undefined` | 请求前转换参数 |
| `shouldFetch` | `(params) => MaybePromise<boolean>` | `undefined` | 请求前判断是否允许请求 |
| `afterFetch` | `(result) => MaybePromise<TResult \| FormItemOption[]>` | `undefined` | 请求后转换响应 |
| `resultField` | `string` | `undefined` | 从响应中提取选项数组的路径 |
| `labelField` | `string` | `'label'` | 选项标签字段 |
| `valueField` | `string` | `'value'` | 选项值字段 |
| `labelFn` | `(option) => string` | `undefined` | 自定义选项标签 |
| `optionComponent` | `Component` | `undefined` | `select` 下拉选项内容组件，通过 `option` Prop 接收规范化后的选项 |
| `childrenField` | `string` | `'children'` | 子级字段名 |
| `autoSelect` | `'first' \| 'last' \| 'one' \| false \| fn` | `false` | 异步选项加载后自动选择 |

## 内置字段类型

| type | 底层组件 | 选项写法 |
| --- | --- | --- |
| `input` | `ElInput` | 无 |
| `autocomplete` | `ElAutocomplete` | 通过 `props.fetchSuggestions` 提供建议 |
| `textarea` | `ElInput type="textarea"` | 默认 4 行高、`maxlength: 300`、显示字数统计并允许纵向拉伸 |
| `inputTag` | `ElInputTag` | 无 |
| `number` | `ElInputNumber` | 无 |
| `select` | `ElSelect` + `ElOption` | `props.options` / `options` / `api` |
| `selectV2` | `ElSelectV2` 虚拟下拉列表 | `props.options` / `options` / `api`；大列表仅渲染可见选项，复用筛选、清空和空状态规则 |
| `tagStyleSelect` | `ArtTagStyleSelect` | `props.options` / `options` / `api`；选项右侧显示 Tag 预览 |
| `segment` | `ElSegmented` | `props.options` / `options` / `api`；默认保持紧凑宽度，需要铺满时显式传入 `props.block` |
| `switch` | `ElSwitch` | 无 |
| `colorPicker` | `ElColorPicker` | 无 |
| `checkbox` | `ElCheckbox` | 无 |
| `radio` | `ElRadio` | 无 |
| `checkboxGroup` | `ElCheckboxGroup` + `ElCheckbox` / `ElCheckboxButton` | `props.options` / `options` / `api`；`props.optionType='button'` 使用按钮样式 |
| `radioGroup` | `ElRadioGroup` + `ElRadio` / `ElRadioButton` | `props.options` / `options` / `api`；`props.optionType='button'` 使用按钮样式 |
| `date` | `ElDatePicker` | 无 |
| `rate` | `ElRate` | 无 |
| `slider` | `ElSlider` | 无 |
| `cascader` | `ElCascader` | `props.options` / `options` / `api` |
| `timePicker` | `ElTimePicker` | 无 |
| `timeSelect` | `ElTimeSelect` | 无 |
| `treeSelect` | `ElTreeSelect` | `props.data` / `options` / `api` |
| `iconPicker` | `ArtIconPicker` | 无 |
| `uploadFile` | `ArtUploadFile` | 通过 `props` 设置文件类型、数量和提示 |
| `uploadImage` | `ArtUploadImage` | 通过 `props` 设置图片类型、数量和尺寸 |
| `divider` | 内置分区标题 | 使用 `label` 作为标题，建议 `span: 24` |

`select`、`cascader` 和 `treeSelect` 在没有可选项或搜索无匹配项时，默认显示统一的插画空状态。可通过 `props.noDataText` 指定业务提示；需要特殊内容时，用字段的 `slots.empty` 覆盖默认空状态。主仓与子仓复用同一个 `ArtForm`，无需在业务页面重复实现。

字段组件的 Element Plus Props 和事件写在 `item.props` 中：

```ts
{
  label: '状态',
  key: 'status',
  type: 'select',
  props: {
    clearable: true,
    placeholder: '请选择状态',
    options: statusOptions,
    onChange: (value: string) => {
      console.log(value)
    }
  }
}
```

## 分区标题

普通表单分区标题直接使用 `type: 'divider'`，不要在业务组件里为标题单独写插槽和样式。

分区标题需要操作按钮时，使用与 `key` 对应的 `Actions` 插槽。按钮位于折叠开关之外，可正常点击；添加类按钮应配图标。

```vue
<ArtForm v-model="form" :items="formItems">
  <template #fieldsSectionActions>
    <ElButton type="primary" plain @click="addField">
      <template #icon><ArtSvgIcon icon="ri:add-line" /></template>
      新增字段
    </ElButton>
  </template>
</ArtForm>
```

```ts
const formItems = computed<FormItem[]>(() => [
  {
    label: '基础信息',
    key: 'basicSection',
    type: 'divider',
    span: 24
  },
  {
    label: '名称',
    key: 'name',
    type: 'input'
  }
])
```

## 异步选项

```ts
const formItems = computed<FormItem[]>(() => [
  {
    label: '地区',
    key: 'region',
    type: 'cascader',
    api: fetchRegionOptions,
    resultField: 'data.records',
    labelField: 'name',
    valueField: 'code',
    childrenField: 'children',
    afterFetch: (response) => response.data,
    autoSelect: 'one',
    props: {
      clearable: true,
      filterable: true
    }
  }
])
```

长文本或复合信息选项可以用 `optionComponent` 自定义下拉内容，`labelFn` 仍负责选中态文本与筛选文本：

```ts
import AddressOption from './address-option.vue'

const items: FormItem[] = [
  {
    label: '地址',
    key: 'addressId',
    type: 'select',
    api: fetchAddressOptions,
    resultField: 'data',
    valueField: 'id',
    labelFn: (option) => String(option.addressDetail ?? ''),
    optionComponent: AddressOption
  }
]
```

## 提交输出清洗

默认清洗策略偏接口友好：

| 策略                  | 默认值 | 说明                 |
| --------------------- | ------ | -------------------- |
| `removeEmptyString`   | `true` | 移除空字符串         |
| `removeEmptyArray`    | `true` | 移除空数组           |
| `removeEmptyObject`   | `true` | 移除清洗后为空的对象 |
| `removeEmptyRichText` | `true` | 移除空富文本占位内容 |
| `keepZero`            | `true` | 保留数字 `0`         |
| `keepFalse`           | `true` | 保留布尔 `false`     |

```vue
<ArtForm
  v-model="form"
  :items="items"
  :sanitize-output="{ removeEmptyString: false }"
  @submit="submitApi"
/>
```

## 使用建议

- 标准栅格布局会在 `ArtForm` 根节点约束横向溢出，用于吸收 `ElRow gutter` 产生的负 margin，避免放入 `ArtDialog`、`ArtDrawer` 或其他滚动容器后出现无意义的横向滚动条。`customLayout` 模式不应用该约束，自定义内容需要自行管理横向滚动区域。
- 父组件可使用 `ref` 或 `reactive` 承接 `v-model`；组件会在现有表单对象上更新当前字段，避免无关的复杂控件因引用变化而重建。
- 普通字段优先用 `items` 描述；复杂字段用同名插槽。
- 已有复杂布局可使用 `custom-layout` 和默认插槽复用表单校验；此模式下 `items` 可省略，原有表单样式类通过 `form-class` 传给内部 `ElForm`。
- 业务弹窗中配合 `ArtDialog` 使用时，通常设置 `show-reset=false`、`show-submit=false`，把提交交给弹窗 Footer。
- Element Plus 字段组件的所有 Props 和事件都写到 `item.props`，例如 `maxlength`、`showWordLimit`、`onChange`。
